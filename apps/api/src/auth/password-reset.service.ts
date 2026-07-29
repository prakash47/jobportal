import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { prisma, type User } from '@jobportal/db';
import { hashPassword, isStrongPassword } from '@jobportal/auth';
import { EmailService } from '../email/email.service';

// Password reset, reworked from an emailed LINK to a 6-digit OTP (SRS §4.12.5).
// Three steps: request a code -> verify it -> spend a one-time ticket to set the
// password. The contract numbers below are owned here; the UI mirrors them in
// copy but this is what actually enforces them.
export const RESET_CODE_LENGTH = 6;
export const RESET_TTL_MINUTES = 15;
// How long the verified ticket stays spendable. Short, because by this point the
// holder has already proven control of the mailbox and only needs to type a
// password.
export const RESET_TICKET_TTL_MINUTES = 10;
export const RESET_MAX_ATTEMPTS = 5;
export const RESET_RESEND_COOLDOWN_MS = 30 * 1000;
export const RESET_MAX_RESENDS = 5;

// Salted with the userId so two users independently issued the same six digits
// cannot collide, and a hash lifted from one row cannot be replayed against
// another account.
function codeHash(userId: number, code: string): string {
  return createHash('sha256').update(`${userId}:${code}`).digest('hex');
}

function ticketHash(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

// CSPRNG-backed. Math.random is seeded predictably and would make one code
// guessable from a handful of earlier ones.
function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(RESET_CODE_LENGTH, '0');
}

// Constant-time compare. timingSafeEqual THROWS on a length mismatch, so lengths
// are checked first — every code we issue is exactly six digits, so the length
// was never a secret and the early return leaks nothing.
function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export interface RequestResetResult {
  expiresAt: string;
  resendAvailableAt: string;
}

export interface VerifyResetResult {
  ticket: string;
  ticketExpiresAt: string;
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(private readonly email: EmailService) {}

  // Step 1 — issue a code.
  //
  // NO ENUMERATION: this returns the SAME shape and the same synthetic timings
  // whether the address is unknown, belongs to an OAuth-only account, or is
  // mid-cooldown. In particular it never throws 429 for a cooldown or a spent
  // resend budget — a rate-limit error raised only for real accounts would
  // itself be the oracle. Instead the send is silently skipped and the caller
  // is handed the timings its countdown needs.
  async requestCode(email: string, ipAddress?: string): Promise<RequestResetResult> {
    const now = new Date();
    // The response every caller gets, computed before any lookup so the shape
    // cannot depend on what we find.
    const fallback: RequestResetResult = {
      expiresAt: new Date(now.getTime() + RESET_TTL_MINUTES * 60 * 1000).toISOString(),
      resendAvailableAt: new Date(now.getTime() + RESET_RESEND_COOLDOWN_MS).toISOString(),
    };

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, passwordHash: true },
    });
    // Unknown address — say nothing, do nothing.
    if (!user) return fallback;
    // OAuth-only account: it has no local password, and a reset must not
    // silently mint a second login path for it (ADR 0001).
    if (!user.passwordHash) return fallback;

    const existing = await prisma.passwordResetToken.findUnique({
      where: { userId: user.id },
      select: { lastSentAt: true, resendCount: true, expiresAt: true },
    });

    // The resend budget is scoped to the LIVE code, not to the account for all
    // time. Once the code has expired the row is inert — it can no longer be
    // guessed against — so a new request starts a fresh window. Without this
    // reset, spending five resends would lock the account out of password
    // recovery permanently, which is a far worse outcome than the abuse the cap
    // exists to bound.
    const stale = !existing || existing.expiresAt <= now;

    if (existing && !stale) {
      const cooldownEndsAt = new Date(existing.lastSentAt.getTime() + RESET_RESEND_COOLDOWN_MS);
      if (cooldownEndsAt > now) {
        // Still cooling down — skip the send, and hand back the real moment the
        // button should re-enable.
        return {
          expiresAt: existing.expiresAt.toISOString(),
          resendAvailableAt: cooldownEndsAt.toISOString(),
        };
      }
      if (existing.resendCount >= RESET_MAX_RESENDS) {
        // Budget spent while the code is still live. Report the code's OWN
        // expiry as the next opportunity: that is the moment `stale` above
        // flips and a fresh window opens. Returning the elapsed cooldown here
        // would be a trap — the form would re-enable Resend, the press would
        // answer 200, and nothing would ever be sent.
        return {
          expiresAt: existing.expiresAt.toISOString(),
          resendAvailableAt: existing.expiresAt.toISOString(),
        };
      }
    }

    const code = generateCode();
    const expiresAt = new Date(now.getTime() + RESET_TTL_MINUTES * 60 * 1000);

    // Upsert, not insert: @@unique([userId]) means a resend REPLACES the code in
    // place, so N resends cannot leave N simultaneously-valid codes standing —
    // which would otherwise gut the attempt cap. attempts/verifiedAt/usedAt and
    // any previously minted ticket all reset, because this is a brand-new
    // secret and anything earned against the old one is void.
    const row = await prisma.passwordResetToken.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        codeHash: codeHash(user.id, code),
        expiresAt,
        lastSentAt: now,
      },
      update: {
        codeHash: codeHash(user.id, code),
        tokenHash: null,
        expiresAt,
        lastSentAt: now,
        attempts: 0,
        verifiedAt: null,
        usedAt: null,
        // A stale row is a fresh window, so its spent budget goes back to zero
        // (see `stale` above); a live one is a genuine resend and counts.
        resendCount: stale ? 0 : { increment: 1 },
      },
      select: { id: true, expiresAt: true, lastSentAt: true },
    });

    await this.email.enqueuePasswordReset(email, user.id, {
      code,
      expiresInMinutes: RESET_TTL_MINUTES,
    });
    this.devOnlyLogCode(email, code);

    // Ids only — never the code, never the address.
    this.logger.log(`password reset code issued row=${row.id} ip=${ipAddress ?? 'n/a'}`);

    return {
      expiresAt: row.expiresAt.toISOString(),
      resendAvailableAt: new Date(
        row.lastSentAt.getTime() + RESET_RESEND_COOLDOWN_MS,
      ).toISOString(),
    };
  }

  // Step 2 — check a typed code and, on success, mint the one-time ticket that
  // step 3 spends. Returning a ticket rather than re-accepting the code means
  // the code never has to be held by the browser or sent twice.
  //
  // ONE DELIBERATE ASYMMETRY, recorded so it is not mistaken for an oversight:
  // a wrong guess against a real account answers "N attempts left", while an
  // address with no live challenge gets the generic message — so the pair
  // (request a code, then guess once) can distinguish a registered address from
  // an unregistered one. It is kept because the count is materially better UX
  // on the one screen where users are already stressed, and because it reveals
  // nothing new: `POST /auth/register` answers 409 Conflict on a taken address
  // (verified), which is a cheaper, single-call oracle for the same fact. If
  // that ever changes, this message must collapse into the generic one too.
  async verifyCode(email: string, code: string): Promise<VerifyResetResult> {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    // Deliberately the same message an existing user with no live challenge
    // gets, so this is not an oracle for which addresses are registered.
    const generic = 'That code is invalid or has expired. Request a new one.';
    if (!user) throw new BadRequestException(generic);

    const row = await prisma.passwordResetToken.findUnique({
      // `attempts` is deliberately NOT selected: the budget is enforced by the
      // conditional UPDATE below, and a snapshot here would only invite gating
      // on a stale value again.
      where: { userId: user.id },
      select: { id: true, codeHash: true, expiresAt: true, usedAt: true },
    });
    if (!row || row.usedAt) throw new BadRequestException(generic);
    if (row.expiresAt <= new Date()) throw new BadRequestException(generic);

    // Claim one of the guess slots BEFORE comparing, in a single conditional
    // statement. Reading `attempts` and incrementing afterwards is a
    // check-then-act: concurrent verifies would all read the same snapshot, all
    // pass, and all get a free guess — so the cap would bound nothing under
    // exactly the conditions it exists for. Here the predicate is evaluated by
    // the UPDATE itself, so the row hands out at most RESET_MAX_ATTEMPTS slots
    // however many callers race, and count === 0 means this caller lost.
    const claimed = await prisma.passwordResetToken.updateMany({
      where: { id: row.id, attempts: { lt: RESET_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (claimed.count === 0) {
      throw new BadRequestException('Too many incorrect attempts. Request a new code.');
    }

    if (!hashesMatch(row.codeHash, codeHash(user.id, code))) {
      // Read back what the counter actually reached rather than deriving it
      // from the stale pre-claim snapshot, so a concurrent guess is reflected
      // rather than overwritten. This only shapes the message; the budget was
      // already enforced above.
      const after = await prisma.passwordResetToken.findUnique({
        where: { id: row.id },
        select: { attempts: true },
      });
      const left = Math.max(0, RESET_MAX_ATTEMPTS - (after?.attempts ?? RESET_MAX_ATTEMPTS));
      throw new BadRequestException(
        `That code is incorrect. ${left} attempt${left === 1 ? '' : 's'} left.`,
      );
    }

    const raw = randomBytes(32).toString('hex');
    const ticketExpiresAt = new Date(Date.now() + RESET_TICKET_TTL_MINUTES * 60 * 1000);
    await prisma.passwordResetToken.update({
      where: { id: row.id },
      // The code is overwritten with the ticket's own phase: verifiedAt gates
      // step 3, and expiresAt is re-based onto the shorter ticket window.
      data: { tokenHash: ticketHash(raw), verifiedAt: new Date(), expiresAt: ticketExpiresAt },
    });

    return { ticket: raw, ticketExpiresAt: ticketExpiresAt.toISOString() };
  }

  // Step 3 — spend the ticket, set the password, and return the User so the
  // caller can mint a session (the reset ends signed in).
  async resetWithTicket(ticket: string, newPassword: string): Promise<User> {
    if (!isStrongPassword(newPassword)) {
      // Must match PASSWORD_RE in packages/auth/src/password.ts, which requires
      // 8+ characters, a DIGIT and a SPECIAL CHARACTER — a letter is not
      // required. Stating anything else sends users round a loop trying to
      // satisfy a rule that is not the one being enforced.
      throw new BadRequestException(
        'Password must be at least 8 characters and include a number and a special character.',
      );
    }

    const row = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: ticketHash(ticket) },
      select: { id: true, userId: true, expiresAt: true, usedAt: true, verifiedAt: true },
    });
    if (!row || !row.verifiedAt || row.usedAt || row.expiresAt < new Date()) {
      throw new BadRequestException('This reset session has expired. Start again.');
    }

    const passwordHash = await hashPassword(newPassword);

    // Atomic: spend the ticket, set the password, and revoke every active
    // session so a leaked refresh token can no longer be rotated. The spend is
    // guarded on usedAt being null so two concurrent submits cannot both win.
    const [spent] = await prisma.$transaction([
      prisma.passwordResetToken.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
      prisma.session.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    if (spent.count === 0) {
      throw new BadRequestException('This reset session has expired. Start again.');
    }

    const user = await prisma.user.findUnique({ where: { id: row.userId } });
    if (!user) throw new BadRequestException('This reset session has expired. Start again.');
    return user;
  }

  // Local-development escape hatch, and nothing more.
  //
  // With RESEND_API_KEY blank, ResendClient logs a stub and returns — no email
  // leaves the process — so without this a developer or tester simply cannot
  // complete the flow. Gated on BOTH a non-production NODE_ENV and an
  // unconfigured mailer, so the moment either a real key or a production build
  // exists this is dead code. It is the only place a reset code is ever written
  // to a log.
  private devOnlyLogCode(email: string, code: string): void {
    if (process.env.NODE_ENV === 'production') return;
    if (process.env.RESEND_API_KEY) return;
    this.logger.warn(
      `DEV-ONLY (Resend not configured, no email was sent) reset code for ${email}: ${code}`,
    );
  }
}
