import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { prisma, type OtpChannel } from '@jobportal/db';
import { isValidOtpDestination, type RequestOtpInput, type VerifyOtpInput } from './dto';

// SRS §4.9.1 — the five contract numbers that define the signup one-time code
// flow. The API owns them; the signup UI hardcodes matching copy ("expires in
// 15 minutes", "resend in 30s") but this is what actually enforces them.
// (OTP_MAX_LIVE_PER_DESTINATION below is a sixth, added afterwards as an abuse
// bound rather than as flow copy — no UI states it.)
export const OTP_CODE_LENGTH = 6;
export const OTP_TTL_MS = 15 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
export const OTP_MAX_RESENDS = 5;

// How many live (unexpired, still-unverified) challenges may exist for ONE
// destination at a time, counted across every signup attempt rather than per
// signupId.
//
// This is the only bound in the flow an attacker cannot reset. `signupId` is
// client-supplied and freely re-mintable (see request()), so OTP_MAX_ATTEMPTS
// and OTP_MAX_RESENDS are caps on a handle the CALLER owns, not on the address
// being targeted: "omit signupId -> brand-new row -> brand-new live code for
// ceo@example.com -> five more guesses" costs nothing, and the per-IP throttles
// on the controller are then the only ceiling, which an attacker raises simply
// by adding source addresses.
//
// What 3 buys: at any instant a destination carries at most 3 live codes, each
// worth OTP_MAX_ATTEMPTS guesses and each replaceable OTP_MAX_RESENDS times, so
// a targeted address absorbs at most 3 * (1 + 5) * 5 = 90 guesses per
// fifteen-minute window — well under 0.1% of the 10^6 code space per window,
// and, crucially, a ceiling that does NOT move when the attacker adds IPs or
// signup handles. Three rather than one because a registrant who abandons a
// signup and starts over legitimately strands a live row (the browser holds the
// signupId in memory, so a reload mints a new one), and the penalty for
// overshooting is a wait of at most the 15-minute TTL, never a permanent block.
export const OTP_MAX_LIVE_PER_DESTINATION = 3;

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

// What to call the destination in a message the registrant reads. The
// rate-limit branches below are shared by both channels, so a single hardcoded
// noun would tell half of all callers about a "number" while they are looking
// at the Email ID field.
function channelNoun(channel: 'EMAIL' | 'PHONE'): string {
  return channel === 'EMAIL' ? 'email address' : 'number';
}

// Key for pg_advisory_xact_lock's (int, int) overload: two 32-bit halves of a
// SHA-256 digest, which makes an accidental collision between two distinct keys
// negligible (and harmless when it happens — two unrelated requests would
// merely take turns). Hashed here rather than with Postgres' hashtext() because
// hashtext is an undocumented internal whose output is not contractual.
function advisoryLockKey(namespace: string, value: string): [number, number] {
  const digest = createHash('sha256').update(`${namespace}|${value}`).digest();
  return [digest.readInt32BE(0), digest.readInt32BE(4)];
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
  // NOTHING IS SENT FROM HERE — or from anywhere else. No SMS gateway and no
  // mailer is wired to this flow: writing the OtpChallenge row IS the whole
  // side effect. The code reaches the registrant only when a Career Queue staff
  // member reads it off /sadmin/otp-sessions and relays it by phone or
  // WhatsApp. That is why the endpoint answers 202 and not 201: it acknowledges
  // the request, and makes no claim that anything was delivered.
  //
  // NO ENUMERATION: this deliberately never looks up a User. Returning 202
  // regardless is not enough on its own — a lookup whose result changed the
  // response, the timing, or what got written would leak the same fact. So the
  // account table is simply not consulted here; "already registered" is
  // discovered at register time, after the caller has proved control of both
  // the address and the number. Same stance as PasswordResetService, which
  // silently no-ops rather than admitting an address is unknown. The
  // per-destination 429 below is the one branch that had to be written with
  // this in mind: what it reveals is that signup codes are already in flight
  // for an address, which is a different fact from whether an ACCOUNT exists
  // for it — and it stays different because nothing on this path, that branch
  // included, reads the User table.
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
    // It is NOT a rate-limit key — the caller mints as many as it likes, which
    // is why the abuse bound below is keyed on the destination instead.
    const signupId = input.signupId || randomBytes(32).toString('hex');

    // The canonical form of the destination, and the form that gets stored.
    // Email addresses are already matched case-insensitively everywhere else in
    // this flow (assertVerifiedPair lowercases both sides, RegisterRecruiterDto
    // lowercases the submitted address), so folding case here changes no
    // outcome — but it is what lets the per-destination cap be a plain equality
    // count. Compare raw strings and "CEO@corp.com" is a different destination
    // from "ceo@corp.com", which resets the cap for the price of one shifted
    // letter. Phone numbers have no case, so PHONE is passed through untouched.
    const destination =
      input.channel === 'EMAIL' ? input.destination.toLowerCase() : input.destination;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
    // One code for whichever branch of the upsert runs — generating separately
    // per branch would put two different secrets in one payload for no reason.
    const code = generateCode();

    // Every gate below is read-then-write, and under READ COMMITTED nothing
    // serialises them on its own: N concurrent requests would all read the same
    // pre-write snapshot and all pass. The two transaction-scoped advisory
    // locks are what make them atomic. They are released by COMMIT *and* by the
    // ROLLBACK that each throw below triggers, so no 429 path leaks a lock, and
    // they are always taken in this order — signup handle first, destination
    // second — so two transactions can never each hold one and wait on the
    // other. There is no fail-open branch on purpose: if the lock or the count
    // cannot run, the transaction throws and no code is issued.
    const row = await prisma.$transaction(async (tx) => {
      const [signupKeyA, signupKeyB] = advisoryLockKey(
        'otp:signup',
        `${signupId}:${input.channel}`,
      );
      // $executeRaw, NOT $queryRaw. pg_advisory_xact_lock() returns `void`, and
      // Prisma cannot deserialize a void column — $queryRaw fails at RUNTIME
      // with "Failed to deserialize column of type 'void'", which would 500
      // every single OTP request. $executeRaw reports a row count and never
      // looks at the columns, so it is the correct call here. (Verified against
      // a live Postgres; a unit test that mocks the client cannot catch this,
      // which is exactly how it got here.)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${signupKeyA}::int, ${signupKeyB}::int)`;
      const [destKeyA, destKeyB] = advisoryLockKey(
        'otp:destination',
        `${input.channel}:${destination}`,
      );
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${destKeyA}::int, ${destKeyB}::int)`;

      const existing = await tx.otpChallenge.findUnique({
        where: { signupId_channel: { signupId, channel: input.channel } },
        select: { lastSentAt: true, resendCount: true },
      });

      if (existing) {
        const resendAvailableAt = new Date(existing.lastSentAt.getTime() + OTP_RESEND_COOLDOWN_MS);
        if (resendAvailableAt > now) {
          const secondsLeft = Math.ceil((resendAvailableAt.getTime() - now.getTime()) / 1000);
          // 429 carries resendAvailableAt so the form can run its countdown off
          // a server timestamp rather than its own clock.
          throw new HttpException(
            {
              statusCode: HttpStatus.TOO_MANY_REQUESTS,
              message: `Please wait ${secondsLeft}s before requesting another code.`,
              resendAvailableAt: resendAvailableAt.toISOString(),
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        // The lifetime cap on ONE challenge row: six codes (the first plus five
        // resends), thirty guesses, and that row is finished. On its own this
        // bounds nothing an attacker cares about, because a fresh signupId buys
        // a fresh row — OTP_MAX_LIVE_PER_DESTINATION below is what turns it
        // into a real ceiling on the address being targeted.
        if (existing.resendCount >= OTP_MAX_RESENDS) {
          throw new HttpException(
            `Too many codes requested for this ${channelNoun(input.channel)}.`,
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }

      // The per-destination bound. Counting only live rows (unexpired and not
      // yet verified) is deliberate: an expired row can no longer be guessed
      // against, and a verified one is short-circuited by verify() before the
      // code is ever compared, so neither belongs in a brute-force budget.
      // A row whose attempts are spent DOES still count — it holds its slot for
      // the rest of its TTL, which is what stops "burn five, start over".
      //
      // Our own (signupId, channel) row is excluded because the upsert below
      // REPLACES it rather than adding to the total; without the exclusion a
      // registrant's own resends would count against them. The invariant the
      // two together maintain is exactly: at most OTP_MAX_LIVE_PER_DESTINATION
      // live rows per (channel, destination), whoever asked for them.
      //
      // The expiresAt filter is what keeps this cheap — @@index([expiresAt])
      // bounds the scan to the last fifteen minutes of challenges rather than
      // the whole table (there is no index on destination).
      const liveElsewhere = await tx.otpChallenge.count({
        where: {
          channel: input.channel,
          destination,
          verifiedAt: null,
          expiresAt: { gt: now },
          NOT: { signupId },
        },
      });
      if (liveElsewhere >= OTP_MAX_LIVE_PER_DESTINATION) {
        // Says nothing about accounts — only that this address already has
        // signup codes in flight, which is true whether or not it is
        // registered. "In a few minutes" is honest: a slot frees as soon as one
        // of those codes reaches its fifteen-minute expiry.
        throw new HttpException(
          `Too many codes have recently been requested for this ${channelNoun(
            input.channel,
          )}. Try again in a few minutes.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Upsert, not insert: @@unique([signupId, channel]) means a resend
      // REPLACES the code in place, so one signup attempt's N resends can never
      // leave N simultaneously-valid codes standing (across signup attempts
      // that is the cap above, not this). attempts and verifiedAt reset because
      // this is a brand-new secret — the guesses spent against the previous one
      // are irrelevant, and a channel that was verified against the old code is
      // no longer verified.
      return tx.otpChallenge.upsert({
        where: { signupId_channel: { signupId, channel: input.channel } },
        create: {
          signupId,
          channel: input.channel,
          destination,
          name: input.name,
          code,
          expiresAt,
          lastSentAt: now,
          ipAddress: ipAddress ?? null,
        },
        update: {
          destination,
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
  // The brute-force bound is a pair of Postgres facts — OtpChallenge.attempts
  // for this code, and OTP_MAX_LIVE_PER_DESTINATION for how many codes one
  // address can have at once — NOT a Redis counter like
  // PerEmailThrottleGuard's. That guard fails OPEN when Redis is unreachable,
  // which is the right call for a login rate-limit (per-IP throttling still
  // applies, and locking every user out is the worse outcome). It would be the
  // wrong call here, because these counters ARE the control that stops a
  // 6-digit secret being enumerated — 1,000,000 possibilities is nothing to a
  // script — so they have to fail CLOSED. Keeping them on the challenge rows is
  // what achieves that: the counters live in the same database as the code, so
  // there is no outage in which the code is still readable but the count can be
  // skipped.
  //
  // attempts alone would not be a bound at all: it is scoped to one row, and
  // request() hands out a fresh row for any client-chosen signupId. It is the
  // per-destination cap that stops the budget being reset; this one only makes
  // a single issued code expensive to guess.
  async verify(input: VerifyOtpInput): Promise<{ verified: true }> {
    const row = await prisma.otpChallenge.findUnique({
      where: { signupId_channel: { signupId: input.signupId, channel: input.channel } },
      // `attempts` is deliberately NOT selected: the budget is enforced by the
      // conditional UPDATE below, and a snapshot of it here would only invite
      // someone to gate on the stale value again.
      select: { id: true, code: true, expiresAt: true, verifiedAt: true },
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
    // Claim one of the OTP_MAX_ATTEMPTS guess slots BEFORE comparing, in a
    // single conditional statement. Testing `row.attempts` from the SELECT
    // above and incrementing afterwards would be a check-then-act: ten verifies
    // landing together all read the same snapshot, all pass the test, and all
    // get a free guess, so the cap would bound nothing under exactly the
    // conditions it exists for. Here the `attempts < max` predicate is
    // evaluated by the UPDATE itself, so the row hands out at most
    // OTP_MAX_ATTEMPTS slots however many callers race for them, and count = 0
    // means this caller lost — the code is dead until a resend mints a new one.
    //
    // Claiming before the comparison (rather than only on a mismatch) is what
    // makes the cap hold for a CORRECT guess too: otherwise a burst could
    // exhaust the budget with wrong guesses while a concurrent right one slips
    // past on the same stale snapshot. The cost is that a successful verify
    // also spends a slot — harmless, because the row is verified in the same
    // breath and verify() short-circuits on verifiedAt from then on.
    const claimed = await prisma.otpChallenge.updateMany({
      where: { id: row.id, attempts: { lt: OTP_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (claimed.count === 0) {
      throw new BadRequestException('Too many incorrect attempts. Request a new code.');
    }

    if (!codesMatch(row.code, input.code)) {
      // Read back what the counter actually reached rather than deriving it
      // from the stale pre-claim snapshot, so a concurrent guess is reflected
      // in the number instead of overwritten by it. This read only shapes the
      // message; the budget was already enforced by the claim above.
      const after = await prisma.otpChallenge.findUnique({
        where: { id: row.id },
        select: { attempts: true },
      });
      const left = Math.max(0, OTP_MAX_ATTEMPTS - (after?.attempts ?? OTP_MAX_ATTEMPTS));
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
