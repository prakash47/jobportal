import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    passwordResetToken: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    session: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('@jobportal/auth', () => ({
  hashPassword: vi.fn(),
  isStrongPassword: vi.fn(),
}));

import { createHash } from 'node:crypto';
import { prisma } from '@jobportal/db';
import { hashPassword, isStrongPassword } from '@jobportal/auth';
import {
  PasswordResetService,
  RESET_MAX_ATTEMPTS,
  RESET_MAX_RESENDS,
  RESET_RESEND_COOLDOWN_MS,
} from './password-reset.service';

const db = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  passwordResetToken: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  session: { updateMany: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};
const mockedStrong = isStrongPassword as ReturnType<typeof vi.fn>;
const mockedHashPw = hashPassword as ReturnType<typeof vi.fn>;

const email = { enqueuePasswordReset: vi.fn() };
const svc = new PasswordResetService(email as never);

const USER = { id: 7, name: 'Aisha', passwordHash: 'argon2-hash' };
const codeHashOf = (userId: number, code: string) =>
  createHash('sha256').update(`${userId}:${code}`).digest('hex');

function liveRow(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: USER.id,
    codeHash: codeHashOf(USER.id, '123456'),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    usedAt: null,
    verifiedAt: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.RESEND_API_KEY;
  db.passwordResetToken.upsert.mockResolvedValue({
    id: 1,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    lastSentAt: new Date(),
  });
});

describe('requestCode — enumeration safety', () => {
  it('returns the same shape for an unknown address and sends nothing', async () => {
    db.user.findUnique.mockResolvedValue(null);
    const res = await svc.requestCode('nobody@example.com');
    expect(res.expiresAt).toBeTruthy();
    expect(res.resendAvailableAt).toBeTruthy();
    expect(email.enqueuePasswordReset).not.toHaveBeenCalled();
    expect(db.passwordResetToken.upsert).not.toHaveBeenCalled();
  });

  it('says nothing for an OAuth-only account (no local password)', async () => {
    db.user.findUnique.mockResolvedValue({ ...USER, passwordHash: null });
    const res = await svc.requestCode('google@example.com');
    expect(res.expiresAt).toBeTruthy();
    expect(email.enqueuePasswordReset).not.toHaveBeenCalled();
  });

  it('never throws while cooling down — a 429 only real accounts get would be an oracle', async () => {
    db.user.findUnique.mockResolvedValue(USER);
    const lastSentAt = new Date(Date.now() - 5_000); // inside the 30s cooldown
    db.passwordResetToken.findUnique.mockResolvedValue({
      lastSentAt,
      resendCount: 0,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    const res = await svc.requestCode('a@b.com');
    expect(new Date(res.resendAvailableAt).getTime()).toBe(
      lastSentAt.getTime() + RESET_RESEND_COOLDOWN_MS,
    );
    // Silently skipped — no new code, no second email.
    expect(email.enqueuePasswordReset).not.toHaveBeenCalled();
    expect(db.passwordResetToken.upsert).not.toHaveBeenCalled();
  });

  it('stops issuing once the resend budget is spent, still without throwing', async () => {
    db.user.findUnique.mockResolvedValue(USER);
    db.passwordResetToken.findUnique.mockResolvedValue({
      lastSentAt: new Date(Date.now() - 60_000), // cooldown elapsed
      resendCount: RESET_MAX_RESENDS,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    await expect(svc.requestCode('a@b.com')).resolves.toBeTruthy();
    expect(db.passwordResetToken.upsert).not.toHaveBeenCalled();
  });

  it('issues a 6-digit code and emails it for a live local account', async () => {
    db.user.findUnique.mockResolvedValue(USER);
    db.passwordResetToken.findUnique.mockResolvedValue(null);
    await svc.requestCode('a@b.com');
    expect(email.enqueuePasswordReset).toHaveBeenCalledOnce();
    const payload = email.enqueuePasswordReset.mock.calls[0]![2] as { code: string };
    expect(payload.code).toMatch(/^\d{6}$/);
    // The plaintext code must never be what we store.
    const written = db.passwordResetToken.upsert.mock.calls[0]![0] as {
      create: { codeHash: string };
    };
    expect(written.create.codeHash).not.toContain(payload.code);
    expect(written.create.codeHash).toBe(codeHashOf(USER.id, payload.code));
  });
});

describe('verifyCode — brute-force bound', () => {
  it('claims an attempt slot with a conditional UPDATE before comparing', async () => {
    db.user.findUnique.mockResolvedValue({ id: USER.id });
    db.passwordResetToken.findUnique.mockResolvedValue(liveRow());
    db.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    db.passwordResetToken.update.mockResolvedValue({});

    await svc.verifyCode('a@b.com', '123456');

    const guard = db.passwordResetToken.updateMany.mock.calls[0]![0] as {
      where: { attempts: { lt: number } };
    };
    // The cap is evaluated by the database, not by a stale read.
    expect(guard.where.attempts.lt).toBe(RESET_MAX_ATTEMPTS);
  });

  it('rejects once the budget is exhausted (the claim loses)', async () => {
    db.user.findUnique.mockResolvedValue({ id: USER.id });
    db.passwordResetToken.findUnique.mockResolvedValue(liveRow());
    db.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.verifyCode('a@b.com', '123456')).rejects.toThrow(/Too many incorrect/);
  });

  it('reports remaining attempts on a wrong code', async () => {
    db.user.findUnique.mockResolvedValue({ id: USER.id });
    db.passwordResetToken.findUnique
      .mockResolvedValueOnce(liveRow())
      .mockResolvedValueOnce({ attempts: 2 });
    db.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    await expect(svc.verifyCode('a@b.com', '999999')).rejects.toThrow(
      `That code is incorrect. ${RESET_MAX_ATTEMPTS - 2} attempts left.`,
    );
  });

  it('gives an unknown address the same message as a missing challenge', async () => {
    db.user.findUnique.mockResolvedValue(null);
    await expect(svc.verifyCode('nobody@example.com', '123456')).rejects.toThrow(
      /invalid or has expired/,
    );
    db.user.findUnique.mockResolvedValue({ id: USER.id });
    db.passwordResetToken.findUnique.mockResolvedValue(null);
    await expect(svc.verifyCode('a@b.com', '123456')).rejects.toThrow(/invalid or has expired/);
  });

  it('refuses an expired code without spending an attempt', async () => {
    db.user.findUnique.mockResolvedValue({ id: USER.id });
    db.passwordResetToken.findUnique.mockResolvedValue(
      liveRow({ expiresAt: new Date(Date.now() - 1000) }),
    );
    await expect(svc.verifyCode('a@b.com', '123456')).rejects.toThrow(BadRequestException);
    expect(db.passwordResetToken.updateMany).not.toHaveBeenCalled();
  });

  it('mints a ticket whose HASH is stored, not the ticket itself', async () => {
    db.user.findUnique.mockResolvedValue({ id: USER.id });
    db.passwordResetToken.findUnique.mockResolvedValue(liveRow());
    db.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    db.passwordResetToken.update.mockResolvedValue({});

    const { ticket } = await svc.verifyCode('a@b.com', '123456');
    const written = db.passwordResetToken.update.mock.calls[0]![0] as {
      data: { tokenHash: string; verifiedAt: Date };
    };
    expect(written.data.tokenHash).toBe(createHash('sha256').update(ticket).digest('hex'));
    expect(written.data.tokenHash).not.toBe(ticket);
    expect(written.data.verifiedAt).toBeInstanceOf(Date);
  });
});

describe('resetWithTicket', () => {
  beforeEach(() => {
    mockedStrong.mockReturnValue(true);
    mockedHashPw.mockResolvedValue('new-argon2-hash');
  });

  it('rejects a weak password before touching the ticket', async () => {
    mockedStrong.mockReturnValue(false);
    await expect(svc.resetWithTicket('t', 'weak')).rejects.toThrow(BadRequestException);
    expect(db.passwordResetToken.findUnique).not.toHaveBeenCalled();
  });

  it('refuses a ticket that was never verified', async () => {
    db.passwordResetToken.findUnique.mockResolvedValue({
      id: 1,
      userId: USER.id,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      verifiedAt: null,
    });
    await expect(svc.resetWithTicket('t', 'Str0ngPass')).rejects.toThrow(/expired/);
  });

  it('refuses a ticket that was already spent', async () => {
    db.passwordResetToken.findUnique.mockResolvedValue({
      id: 1,
      userId: USER.id,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(),
      verifiedAt: new Date(),
    });
    await expect(svc.resetWithTicket('t', 'Str0ngPass')).rejects.toThrow(/expired/);
  });

  it('sets the password and revokes every session in one transaction', async () => {
    db.passwordResetToken.findUnique.mockResolvedValue({
      id: 1,
      userId: USER.id,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      verifiedAt: new Date(),
    });
    db.$transaction.mockResolvedValue([{ count: 1 }, {}, { count: 3 }]);
    db.user.findUnique.mockResolvedValue({ id: USER.id, email: 'a@b.com' });

    await svc.resetWithTicket('t', 'Str0ngPass');

    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(db.session.updateMany).toHaveBeenCalledWith({
      where: { userId: USER.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('loses the race when a concurrent submit already spent the ticket', async () => {
    db.passwordResetToken.findUnique.mockResolvedValue({
      id: 1,
      userId: USER.id,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      verifiedAt: new Date(),
    });
    // The guarded updateMany matched nothing — the other request won.
    db.$transaction.mockResolvedValue([{ count: 0 }, {}, { count: 0 }]);
    await expect(svc.resetWithTicket('t', 'Str0ngPass')).rejects.toThrow(/expired/);
  });
});
