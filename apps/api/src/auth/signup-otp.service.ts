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
import { prisma, type Prisma } from '@jobportal/db';
import { EmailService } from '../email/email.service';

// Email verification for JOB-SEEKER signup.
//
// WHY THIS EXISTS
//
// Registration accepted any syntactically-valid address. Malformed input was
// already rejected (`@gmail`, `@test`, spaces), but `someone@gmail.con` and
// `nobody@thisdomaindoesnotexist.com` both created an account and reported
// success — reproduced against the live API before this was written. No
// validator can fix that: `.con` is a legal TLD string, and whether a mailbox
// exists is simply not derivable from the text. The only proof is that someone
// received something sent to it.
//
// WHY IT IS A SEPARATE SERVICE FROM RecruiterOtpService
//
// Not a preference, and not duplication for its own sake:
//   1. `RecruiterAuthModule` does not export its OTP service, and it IMPORTS
//      `AuthModule` — so injecting it here would be a circular dependency.
//   2. The recruiter surface is owned by another developer on this team; the
//      seeker flow must not be able to break their signup.
// The security properties below are deliberately kept identical to theirs, and
// a Notice in WORKLOG.md proposes extracting one shared engine when both owners
// can coordinate. If you change a bound here, change it there too.
//
// WHAT IS DIFFERENT, on purpose:
//   - EMAIL only. No phone channel: seekers are the drop-off-sensitive audience
//     and no SMS provider is configured in this repo at all.
//   - It actually SENDS the code. The recruiter flow never dispatches one
//     anywhere (see the Notice) — a code is generated and only a staff member
//     revealing it at /sadmin/otp-sessions can deliver it.

/** SRS §4.12 — the numbers that define the seeker signup code flow. */
export const SIGNUP_OTP_CODE_LENGTH = 6;
export const SIGNUP_OTP_TTL_MS = 15 * 60 * 1000;
export const SIGNUP_OTP_MAX_ATTEMPTS = 5;
export const SIGNUP_OTP_RESEND_COOLDOWN_MS = 30 * 1000;
export const SIGNUP_OTP_MAX_RESENDS = 5;

/**
 * How long a VERIFIED challenge may still be spent at /auth/register, measured
 * from `verifiedAt` rather than from the code's own expiry.
 *
 * SEEKER-ONLY — deliberately not part of the "identical to the recruiter
 * engine" set above, all six of which still match theirs exactly.
 *
 * The code's 15-minute life and the time allowed to FINISH the form are two
 * different deadlines that were being served by one constant, and the result
 * was a dead end: verify at 14:59, take two minutes over a password, and
 * register refused while the form still showed a green verified tick. Proof of
 * control does not decay on the code's schedule — the code establishes a fact
 * about the address, and that fact does not stop being true at minute 16.
 *
 * Bounded rather than open-ended because a verified handle IS the capability to
 * create an account for that address. 30 minutes also sits well inside the
 * hourly OTP purge (`OTP_PURGE_GRACE_MS` = 60 min in job-lifecycle.processor),
 * so the row cannot be swept while the window it grants is still open: worst
 * case the window closes at verifiedAt+30 for a row not purgeable until
 * expiresAt+60.
 */
export const SIGNUP_OTP_COMPLETION_MS = 30 * 60 * 1000;

/**
 * Live (unexpired, unverified) challenges permitted per destination, counted
 * across every signup attempt rather than per signupId.
 *
 * The only bound here an attacker cannot reset. `signupId` is client-supplied
 * and freely re-mintable, so the attempt and resend caps bound a handle the
 * CALLER owns, not the address being targeted — "omit signupId, get a fresh row
 * and five more guesses" would otherwise cost nothing. At 3, one address
 * absorbs at most 3 × (1 + 5) × 5 = 90 guesses per 15-minute window against a
 * 10^6 space, and that ceiling does not move when the attacker adds IPs.
 */
export const SIGNUP_OTP_MAX_LIVE_PER_DESTINATION = 3;

/**
 * Live challenges one IP may hold for a single address, on top of the ceiling
 * above. SEEKER-ONLY, and not part of the identical-to-recruiter set.
 *
 * The ceiling bounds GUESSES, which is what it was written for, but it counts
 * rows without regard to who created them. That was survivable while a code was
 * optional; this branch makes a verified challenge MANDATORY at /auth/register,
 * so occupying those slots stops being "you must wait for a code" and becomes
 * "you cannot register at all". One unauthenticated caller could take all three
 * for any address from a single IP, comfortably inside the 5/min throttle.
 *
 * At 1, cornering an address costs an attacker SIGNUP_OTP_MAX_LIVE_PER_DESTINATION
 * distinct IPs instead of one request, and the guess ceiling is unchanged.
 */
export const SIGNUP_OTP_MAX_LIVE_PER_IP = 1;

/** Emergency stop for new account creation. ON means signup is DISABLED. */
const NEW_REGISTRATIONS_KILLSWITCH_FLAG = 'killswitch.new_registrations';

/** The channel this service owns. Phone is deliberately not supported. */
const CHANNEL = 'EMAIL' as const;

function generateCode(): string {
  // randomInt, not Math.random: this is a credential.
  return String(randomInt(0, 10 ** SIGNUP_OTP_CODE_LENGTH)).padStart(
    SIGNUP_OTP_CODE_LENGTH,
    '0',
  );
}

/** Constant-time compare so a wrong code cannot be narrowed by timing. */
function codesMatch(stored: string, submitted: string): boolean {
  const a = Buffer.from(stored, 'utf8');
  const b = Buffer.from(submitted, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Key for `pg_advisory_xact_lock(int, int)` — two halves of a SHA-256 digest.
 * An accidental collision is negligible and harmless (two unrelated requests
 * merely take turns).
 */
function advisoryLockKey(namespace: string, value: string): [number, number] {
  const digest = createHash('sha256').update(`${namespace}|${value}`).digest();
  return [digest.readInt32BE(0), digest.readInt32BE(4)];
}

export interface RequestSignupOtpResult {
  signupId: string;
  expiresAt: string;
  resendAvailableAt: string;
  /**
   * The cooldown as a DURATION, which is what the client actually counts down
   * from. `resendAvailableAt` is kept for display and logging, but a client
   * that derived the countdown by subtracting its own clock from that instant
   * would be wrong by exactly the device's skew — and a phone minutes out of
   * true is ordinary, especially on Android in India. A duration plus locally
   * elapsed time has no such term.
   */
  resendInSeconds: number;
}

@Injectable()
export class SignupOtpService {
  private readonly logger = new Logger(SignupOtpService.name);

  constructor(private readonly email: EmailService) {}

  async assertNewRegistrationsOpen(): Promise<void> {
    if (await isFlagEnabled(NEW_REGISTRATIONS_KILLSWITCH_FLAG)) {
      throw new ServiceUnavailableException('New sign-ups are temporarily unavailable');
    }
  }

  /**
   * Issue (or resend) a code to an email address.
   *
   * Says nothing about whether the address is already registered. A caller can
   * always learn that from `/auth/register`'s 409 — which a registrant has to
   * be told — but making THIS endpoint an oracle would let it be farmed by
   * someone who never proves control of anything.
   */
  async request(
    input: { email: string; name: string; signupId?: string | undefined },
    ipAddress: string | undefined,
  ): Promise<RequestSignupOtpResult> {
    await this.assertNewRegistrationsOpen();

    const destination = input.email.trim().toLowerCase();
    // 32 bytes — this handle is the capability that lets register() claim a
    // verified address, so it is sized like a session token.
    const signupId = input.signupId?.trim() || randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SIGNUP_OTP_TTL_MS);
    const code = generateCode();

    // Every gate below is read-then-write, and READ COMMITTED serialises none
    // of them: N concurrent requests would all read the same pre-write snapshot
    // and all pass. The two transaction-scoped advisory locks make them atomic.
    // Taken in a fixed order — signup handle, then destination — so two
    // transactions cannot each hold one and wait on the other. No fail-open
    // branch: if a lock or count cannot run, the transaction throws and no code
    // is issued.
    const row = await prisma.$transaction(async (tx) => {
      const [signupKeyA, signupKeyB] = advisoryLockKey('signup-otp:signup', signupId);
      // $executeRaw, NOT $queryRaw: pg_advisory_xact_lock() returns void, and
      // Prisma cannot deserialize a void column — $queryRaw fails at RUNTIME
      // and would 500 every request. A mocked-client unit test cannot catch
      // that, which is how it reached production in the recruiter flow once.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${signupKeyA}::int, ${signupKeyB}::int)`;
      const [destKeyA, destKeyB] = advisoryLockKey('signup-otp:destination', destination);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${destKeyA}::int, ${destKeyB}::int)`;

      const existing = await tx.otpChallenge.findUnique({
        where: { signupId_channel: { signupId, channel: CHANNEL } },
        select: { lastSentAt: true, resendCount: true },
      });

      if (existing) {
        const resendAvailableAt = new Date(
          existing.lastSentAt.getTime() + SIGNUP_OTP_RESEND_COOLDOWN_MS,
        );
        if (resendAvailableAt > now) {
          const secondsLeft = Math.ceil((resendAvailableAt.getTime() - now.getTime()) / 1000);
          // Carries the timestamp so the form runs its countdown off a server
          // clock rather than the device's.
          throw new HttpException(
            {
              statusCode: HttpStatus.TOO_MANY_REQUESTS,
              message: `Please wait ${secondsLeft}s before requesting another code.`,
              resendAvailableAt: resendAvailableAt.toISOString(),
              // The duration matters more than the instant here: this is the
              // response that re-arms the button, and it is the one a skewed
              // device clock would otherwise get wrong.
              resendInSeconds: secondsLeft,
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        if (existing.resendCount >= SIGNUP_OTP_MAX_RESENDS) {
          throw new HttpException(
            'Too many codes requested for this email address.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }

      // The per-destination ceiling. NOTE the scope: this bounds challenges
      // issued by THIS service. RecruiterOtpService writes the same table and
      // takes a destination lock under a DIFFERENT advisory namespace, so the
      // two do not exclude each other and a genuine seeker/recruiter race on
      // one address can leave 4 live rows rather than 3. Raised for the
      // recruiter owner as a WORKLOG notice rather than fixed here, since
      // aligning the namespaces means editing their file.
      //
      // Only LIVE rows count: an expired one can
      // no longer be guessed against, and a verified one short-circuits before
      // any comparison. A row with spent attempts DOES still count — it holds
      // its slot for the rest of its TTL, which is what stops "burn five, start
      // over". Our own row is excluded because the upsert replaces it.
      const liveElsewhere = await tx.otpChallenge.count({
        where: {
          channel: CHANNEL,
          destination,
          verifiedAt: null,
          expiresAt: { gt: now },
          NOT: { signupId },
        },
      });
      if (liveElsewhere >= SIGNUP_OTP_MAX_LIVE_PER_DESTINATION) {
        throw new HttpException(
          'Too many codes have recently been requested for this email address. Try again in a few minutes.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // The per-IP sub-cap (see SIGNUP_OTP_MAX_LIVE_PER_IP). Deliberately
      // SKIPPED when the IP is unknown: an absent IP would otherwise collapse
      // every such caller into one shared bucket and lock them all out at the
      // first request. Those are still bound by the ceiling above.
      //
      // The message is character-for-character the ceiling's, so a caller
      // cannot tell which limit they hit — knowing that would reveal whether
      // somebody else is mid-signup on this address.
      if (ipAddress) {
        const liveFromThisIp = await tx.otpChallenge.count({
          where: {
            channel: CHANNEL,
            destination,
            ipAddress,
            verifiedAt: null,
            expiresAt: { gt: now },
            NOT: { signupId },
          },
        });
        if (liveFromThisIp >= SIGNUP_OTP_MAX_LIVE_PER_IP) {
          throw new HttpException(
            'Too many codes have recently been requested for this email address. Try again in a few minutes.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }

      // Upsert, not insert: @@unique([signupId, channel]) means a resend
      // REPLACES the code, so N resends never leave N valid codes standing.
      // attempts and verifiedAt reset because this is a brand-new secret.
      return tx.otpChallenge.upsert({
        where: { signupId_channel: { signupId, channel: CHANNEL } },
        create: {
          signupId,
          channel: CHANNEL,
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

    // Ids only — never the code, never the destination.
    this.logger.log(`signup otp issued challenge=${row.id}`);

    // Delivery is fire-and-log: the challenge is already committed, so a mail
    // outage must not 500 a request whose primary effect succeeded. The user
    // can resend, and /sadmin/otp-sessions can reveal it as a staff fallback.
    this.email
      .enqueueSignupOtp(destination, {
        code,
        name: input.name,
        expiresInMinutes: Math.round(SIGNUP_OTP_TTL_MS / 60000),
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `signup otp email enqueue failed for challenge=${row.id}: ${
            err instanceof Error ? err.message : 'unknown'
          }`,
        );
      });
    this.devOnlyLogCode(destination, code);

    const resendAt = new Date(row.lastSentAt.getTime() + SIGNUP_OTP_RESEND_COOLDOWN_MS);
    return {
      signupId,
      expiresAt: row.expiresAt.toISOString(),
      resendAvailableAt: resendAt.toISOString(),
      resendInSeconds: Math.max(0, Math.round((resendAt.getTime() - row.lastSentAt.getTime()) / 1000)),
    };
  }

  /** Check a typed code against the live challenge for this signup. */
  async verify(input: { signupId: string; code: string }): Promise<{ verified: true }> {
    const row = await prisma.otpChallenge.findUnique({
      where: { signupId_channel: { signupId: input.signupId, channel: CHANNEL } },
      // `attempts` is deliberately NOT selected: the budget is enforced by the
      // conditional UPDATE below, and a snapshot here would invite gating on
      // the stale value again.
      select: { id: true, code: true, destination: true, expiresAt: true, verifiedAt: true },
    });
    if (!row) throw new BadRequestException('Request a code first.');

    // Idempotent, and checked BEFORE expiry: an address verified inside the
    // window stays verified even once the code ages out, so a slow registrant
    // does not lose a tick they earned. That promise is only kept because
    // register() bounds the challenge by SIGNUP_OTP_COMPLETION_MS from
    // `verifiedAt` rather than by the code's own `expiresAt` — checked in
    // assertVerifiedEmail below. Tying it to `expiresAt` would make this
    // early return hollow: the tick would survive here and be refused there.
    if (row.verifiedAt) return { verified: true };

    const now = new Date();
    if (row.expiresAt <= now) {
      throw new BadRequestException('That code has expired. Request a new one.');
    }

    // Claim a guess slot BEFORE comparing, in ONE conditional statement.
    // Reading `attempts` above and incrementing after would be check-then-act:
    // ten verifies landing together all read the same snapshot, all pass, and
    // all get a free guess — so the cap would bound nothing under exactly the
    // conditions it exists for. Claiming before the comparison (not only on a
    // mismatch) is what makes it hold for a CORRECT guess too.
    const claimed = await prisma.otpChallenge.updateMany({
      where: { id: row.id, attempts: { lt: SIGNUP_OTP_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (claimed.count === 0) {
      throw new BadRequestException('Too many incorrect attempts. Request a new code.');
    }

    if (!codesMatch(row.code, input.code)) {
      const after = await prisma.otpChallenge.findUnique({
        where: { id: row.id },
        select: { attempts: true },
      });
      const left = Math.max(0, SIGNUP_OTP_MAX_ATTEMPTS - (after?.attempts ?? SIGNUP_OTP_MAX_ATTEMPTS));
      throw new BadRequestException(
        `That code is incorrect. ${left} attempt${left === 1 ? '' : 's'} left.`,
      );
    }

    // Compare-and-swap, NOT update-by-id. Everything above ran off the snapshot
    // read at the top of this method, and `request()` rewrites `destination`,
    // `code` and `expiresAt` on this very row (there is exactly one per
    // signupId+channel) inside a transaction holding two advisory locks that
    // verify() does not take. Stamping by id alone would therefore mark
    // whatever the row points at NOW as verified — including an address a
    // concurrent request() swapped in — using a code the caller was
    // legitimately shown for a DIFFERENT address. That is the reported bug
    // reintroduced one layer down, so the write re-asserts the exact pair it
    // matched and touches 0 rows if anything moved.
    const stamped = await prisma.otpChallenge.updateMany({
      where: {
        id: row.id,
        code: row.code,
        destination: row.destination,
        verifiedAt: null,
      },
      data: { verifiedAt: now },
    });

    if (stamped.count === 0) {
      // Two ways to get here, and they are not the same. A concurrent verify()
      // may have stamped this IDENTICAL challenge, which is the outcome we
      // wanted anyway — that is idempotent success, matching the early return
      // above. Anything else means the row moved, and must not be verified.
      const current = await prisma.otpChallenge.findUnique({
        where: { id: row.id },
        select: { code: true, destination: true, verifiedAt: true },
      });
      const sameChallengeAlreadyVerified =
        current !== null &&
        current.verifiedAt !== null &&
        current.code === row.code &&
        current.destination === row.destination;
      if (!sameChallengeAlreadyVerified) {
        throw new BadRequestException('That code is no longer valid. Request a new one.');
      }
    }

    return { verified: true };
  }

  /**
   * Register-time binding check: does this signup hold a verified, unexpired
   * challenge for the EXACT address now being registered?
   *
   * Re-checking `destination` is the load-bearing part. Without it a caller
   * could verify an address they own, then submit somebody else's in the
   * register call and have it created as verified — which is the whole bug
   * this flow exists to prevent, reintroduced one layer down.
   */
  async assertVerifiedEmail(signupId: string, email: string): Promise<void> {
    const row = await prisma.otpChallenge.findUnique({
      where: { signupId_channel: { signupId, channel: CHANNEL } },
      select: { destination: true, verifiedAt: true },
    });
    const now = new Date();
    // Bounded from `verifiedAt`, NOT from the code's `expiresAt`: see
    // SIGNUP_OTP_COMPLETION_MS. `expiresAt` gates entering the code; this gates
    // finishing the form, and they are different deadlines.
    const ok =
      row !== null &&
      row.verifiedAt !== null &&
      now.getTime() - row.verifiedAt.getTime() <= SIGNUP_OTP_COMPLETION_MS &&
      row.destination.toLowerCase() === email.trim().toLowerCase();

    if (!ok) {
      // ONE message for every failure mode. Which of missing / stale /
      // mismatched applies is not something a caller needs, and saying so
      // would turn this into an oracle for what a signupId has verified.
      throw new BadRequestException('Verify your email address before creating your account.');
    }
  }

  /**
   * Spend the verified challenge, inside the caller's register transaction.
   *
   * Modelled as a DELETE rather than a `consumedAt` flag, matching the
   * recruiter flow, and it buys three things: the spend is an atomic
   * compare-and-swap (a second concurrent register deletes 0 rows and can be
   * rejected), the plaintext code is destroyed the moment it stops being
   * needed, and a verified challenge can never be replayed against a second
   * registration.
   */
  async consumeVerified(tx: Prisma.TransactionClient, signupId: string): Promise<void> {
    const spent = await tx.otpChallenge.deleteMany({
      where: { signupId, channel: CHANNEL, verifiedAt: { not: null } },
    });
    if (spent.count === 0) {
      throw new BadRequestException('Verify your email address before creating your account.');
    }
  }

  /**
   * Local-development escape hatch, and nothing more.
   *
   * With RESEND_API_KEY blank the mailer logs a stub and returns, so without
   * this a tester cannot complete the flow at all. Gated on BOTH a
   * non-production NODE_ENV and an unconfigured mailer, so the moment either a
   * real key or a production build exists this is dead code. Mirrors
   * PasswordResetService.devOnlyLogCode — the only other place a code is ever
   * written to a log.
   */
  private devOnlyLogCode(email: string, code: string): void {
    if (process.env.NODE_ENV === 'production') return;
    if (process.env.RESEND_API_KEY) return;
    this.logger.warn(
      `DEV-ONLY (Resend not configured, no email was sent) signup code for ${email}: ${code}`,
    );
  }
}
