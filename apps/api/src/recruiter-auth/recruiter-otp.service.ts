import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { prisma, type OtpChannel } from '@jobportal/db';
import { isValidOtpDestination, type RequestOtpInput, type VerifyOtpInput } from './dto';

// SRS §4.9.1 — the five numbers that define the signup one-time code flow.
// The API owns them; the signup UI hardcodes matching copy ("expires in 15
// minutes", "resend in 30s") but this is what actually enforces them.
export const OTP_CODE_LENGTH = 6;
export const OTP_TTL_MS = 15 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
export const OTP_MAX_RESENDS = 5;

// L3 killswitch — emergency stop for new account creation. ON (enabled:true)
// means signup is DISABLED. The key has existed since the SRS §7.8 seed with no
// enforcement anywhere; its two consumers are here (nobody can start a signup)
// and RecruiterRegistrationService (nobody can finish one), so a flip stops the
// flow at both its first and its last step without a redeploy.
const NEW_REGISTRATIONS_KILLSWITCH_FLAG = 'killswitch.new_registrations';

// 6 digits, zero-padded. randomInt is the CSPRNG-backed generator — Math.random
// is seeded from a predictable source and would make a code guessable from a
// handful of earlier ones.
function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(OTP_CODE_LENGTH, '0');
}

// Constant-time comparison of the stored code against what was typed.
// timingSafeEqual THROWS on a length mismatch, so lengths are compared first —
// defence in depth, since VerifyOtpDto already rejects anything that is not six
// digits. The early return leaks nothing: every code we issue is exactly six
// digits, so the length was never a secret.
function codesMatch(stored: string, supplied: string): boolean {
  const a = Buffer.from(stored, 'utf8');
  const b = Buffer.from(supplied, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface RequestOtpResult {
  signupId: string;
  expiresAt: string;
  resendAvailableAt: string;
}

@Injectable()
export class RecruiterOtpService {
  private readonly logger = new Logger(RecruiterOtpService.name);

  // Issue a fresh code for one channel of one signup attempt, creating the
  // challenge row on the first call and overwriting it on every resend.
  //
  // NO ENUMERATION: this deliberately never looks up a User. Returning 202
  // regardless is not enough on its own — a lookup whose result changed the
  // response, the timing, or what got written would leak the same fact. So the
  // account table is simply not consulted here; "already registered" is
  // discovered at register time, after the caller has proved control of both
  // the address and the number. Same stance as PasswordResetService, which
  // silently no-ops rather than admitting an address is unknown.
  async request(
    input: RequestOtpInput,
    ipAddress: string | undefined,
  ): Promise<RequestOtpResult> {
    await this.assertNewRegistrationsOpen();

    if (!isValidOtpDestination(input.channel, input.destination)) {
      throw new BadRequestException(
        input.channel === 'EMAIL'
          ? 'Enter a valid email address.'
          : 'Enter a valid mobile number.',
      );
    }

    // 32 bytes = 256 bits of entropy. This handle is the capability that lets
    // the final register call claim a verified pair, so it has to be as
    // unguessable as a session token (same size PasswordResetService uses).
    // A blank string counts as absent: a controlled React input that starts at
    // '' would otherwise fail on the one call that is meant to mint the id.
    const signupId = input.signupId || randomBytes(32).toString('hex');
    const now = new Date();

    const existing = await prisma.otpChallenge.findUnique({
      where: { signupId_channel: { signupId, channel: input.channel } },
      select: { lastSentAt: true, resendCount: true },
    });

    if (existing) {
      const resendAvailableAt = new Date(existing.lastSentAt.getTime() + OTP_RESEND_COOLDOWN_MS);
      if (resendAvailableAt > now) {
        const secondsLeft = Math.ceil((resendAvailableAt.getTime() - now.getTime()) / 1000);
        // 429 carries resendAvailableAt so the form can run its countdown off a
        // server timestamp rather than its own clock.
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: `Please wait ${secondsLeft}s before requesting another code.`,
            resendAvailableAt: resendAvailableAt.toISOString(),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      // The lifetime cap on one challenge row. Without it the 5-attempt burn
      // would cost an attacker nothing — resend, guess 5 more, forever.
      if (existing.resendCount >= OTP_MAX_RESENDS) {
        throw new HttpException(
          'Too many codes requested for this number.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
    // One code for whichever branch runs — generating separately per branch
    // would put two different secrets in one payload for no reason.
    const code = generateCode();
    // Upsert, not insert: @@unique([signupId, channel]) means a resend REPLACES
    // the code in place, so N resends can never leave N simultaneously-valid
    // codes standing. attempts and verifiedAt reset because this is a brand-new
    // secret — the guesses spent against the previous one are irrelevant, and a
    // channel that was verified against the old code is no longer verified.
    const row = await prisma.otpChallenge.upsert({
      where: { signupId_channel: { signupId, channel: input.channel } },
      create: {
        signupId,
        channel: input.channel,
        destination: input.destination,
        name: input.name,
        code,
        expiresAt,
        lastSentAt: now,
        ipAddress: ipAddress ?? null,
      },
      update: {
        destination: input.destination,
        name: input.name,
        code,
        expiresAt,
        lastSentAt: now,
        attempts: 0,
        verifiedAt: null,
        resendCount: { increment: 1 },
        ipAddress: ipAddress ?? null,
      },
      select: { id: true, expiresAt: true, lastSentAt: true },
    });

    // Ids and the channel only — never the code, never the destination.
    this.logger.log(`otp issued challenge=${row.id} channel=${input.channel}`);

    return {
      signupId,
      expiresAt: row.expiresAt.toISOString(),
      resendAvailableAt: new Date(
        row.lastSentAt.getTime() + OTP_RESEND_COOLDOWN_MS,
      ).toISOString(),
    };
  }

  // Check a typed code against the live challenge for one channel.
  //
  // The brute-force bound is OtpChallenge.attempts in Postgres, NOT a Redis
  // counter like PerEmailThrottleGuard's. That guard fails OPEN when Redis is
  // unreachable, which is the right call for a login rate-limit (per-IP
  // throttling still applies, and locking every user out is the worse
  // outcome). It would be the wrong call here, because this counter IS the
  // control that stops a 6-digit secret being enumerated — 1,000,000
  // possibilities is nothing to a script — so it has to fail CLOSED. Keeping it
  // on the challenge row is what achieves that: the counter lives in the same
  // database as the code, so there is no outage in which the code is still
  // readable but the count can be skipped.
  async verify(input: VerifyOtpInput): Promise<{ verified: true }> {
    const row = await prisma.otpChallenge.findUnique({
      where: { signupId_channel: { signupId: input.signupId, channel: input.channel } },
      select: { id: true, code: true, expiresAt: true, attempts: true, verifiedAt: true },
    });
    if (!row) throw new BadRequestException('Request a code first.');

    // Idempotent, and checked BEFORE expiry on purpose: a channel that was
    // verified inside the window stays verified for the rest of the signup even
    // once the code itself ages out, so a slow registrant does not lose a green
    // tick they legitimately earned. (Register re-checks expiry separately —
    // see assertVerifiedPair.)
    if (row.verifiedAt) return { verified: true };

    const now = new Date();
    if (row.expiresAt <= now) {
      throw new BadRequestException('That code has expired. Request a new one.');
    }
    // Burnt: the code is dead until a resend mints a new one. Checked before
    // the comparison, so even the correct code is refused once the budget is
    // spent — otherwise an attacker who guesses right on try 6 still wins.
    if (row.attempts >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException('Too many incorrect attempts. Request a new code.');
    }

    if (!codesMatch(row.code, input.code)) {
      // Atomic increment, not read-modify-write: two guesses landing together
      // must cost two attempts, and `attempts: row.attempts + 1` would let them
      // cost one.
      const after = await prisma.otpChallenge.update({
        where: { id: row.id },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });
      const left = Math.max(0, OTP_MAX_ATTEMPTS - after.attempts);
      throw new BadRequestException(
        `That code is incorrect. ${left} attempt${left === 1 ? '' : 's'} left.`,
      );
    }

    await prisma.otpChallenge.update({
      where: { id: row.id },
      data: { verifiedAt: now },
    });
    return { verified: true };
  }

  // Register-time binding check: does this signup attempt actually hold a
  // verified EMAIL row AND a verified PHONE row, for the exact address and
  // number now being registered?
  //
  // Re-checking `destination` is the load-bearing part. Without it a caller
  // could verify their own address, then submit someone else's in the register
  // body and have the OTP rows vouch for it. Re-checking expiry matters too:
  // verify() lets an already-verified channel stay verified past the TTL, so
  // this is where a signup that stalled for hours is sent back to the start.
  async assertVerifiedPair(signupId: string, email: string, phone: string): Promise<void> {
    const rows = await prisma.otpChallenge.findMany({
      where: { signupId },
      select: { channel: true, destination: true, verifiedAt: true, expiresAt: true },
    });
    const now = new Date();

    const holds = (channel: OtpChannel, submitted: string): boolean => {
      const row = rows.find((r) => r.channel === channel);
      if (!row || !row.verifiedAt || row.expiresAt <= now) return false;
      // Email is case-insensitive (and the DTO already lowercased the submitted
      // side); a phone is compared byte-for-byte because the platform stores it
      // free-form and normalising here would accept a number that was never the
      // one verified.
      return channel === 'EMAIL'
        ? row.destination.toLowerCase() === submitted.toLowerCase()
        : row.destination === submitted;
    };

    if (!holds('EMAIL', email) || !holds('PHONE', phone)) {
      // One message for every failure mode — which channel is missing, stale or
      // mismatched is not something a caller needs, and saying so would turn
      // this into an oracle for what a given signupId has already verified.
      throw new BadRequestException(
        'Verify your email address and mobile number before creating your account.',
      );
    }
  }

  // Public because RecruiterRegistrationService gates on the same flag: a
  // signup has two server-side steps that must both be closed by one flip, and
  // sharing this method is what keeps the key AND the 503 copy identical in
  // both places (the signup form surfaces the message verbatim wherever it
  // lands).
  async assertNewRegistrationsOpen(): Promise<void> {
    if (await isFlagEnabled(NEW_REGISTRATIONS_KILLSWITCH_FLAG)) {
      throw new ServiceUnavailableException('New sign-ups are temporarily unavailable');
    }
  }
}
