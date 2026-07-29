import { BadRequestException, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/feature-flags', () => ({ isFlagEnabled: vi.fn() }));
vi.mock('@jobportal/db', () => ({
  prisma: {
    otpChallenge: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
  },
}));
// Only randomInt is replaced — the code generator has to be pinned to assert
// zero-padding. randomBytes and timingSafeEqual stay REAL, because the point of
// the comparison test is that the real constant-time primitive is what runs.
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, randomInt: vi.fn(actual.randomInt) };
});

import { randomInt } from 'node:crypto';
import { prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import {
  OTP_MAX_ATTEMPTS,
  OTP_MAX_RESENDS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  RecruiterOtpService,
} from './recruiter-otp.service';

const m = prisma as unknown as {
  otpChallenge: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};
const mockedFlag = isFlagEnabled as unknown as ReturnType<typeof vi.fn>;
const mockedRandomInt = randomInt as unknown as ReturnType<typeof vi.fn>;

const NOW = new Date('2026-07-29T10:00:00.000Z');
const SIGNUP_ID = 'a'.repeat(64);

// What upsert hands back on the happy path: the row as written.
function upsertedRow(over: Partial<{ id: number; expiresAt: Date; lastSentAt: Date }> = {}) {
  return {
    id: 1,
    expiresAt: new Date(NOW.getTime() + OTP_TTL_MS),
    lastSentAt: NOW,
    ...over,
  };
}

describe('RecruiterOtpService.request', () => {
  let service: RecruiterOtpService;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mockedFlag.mockResolvedValue(false); // killswitch OFF → signup live
    mockedRandomInt.mockReturnValue(42);
    m.otpChallenge.findUnique.mockResolvedValue(null);
    m.otpChallenge.upsert.mockResolvedValue(upsertedRow());
    service = new RecruiterOtpService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is blocked by killswitch.new_registrations (L3) before any validation or DB work', async () => {
    mockedFlag.mockResolvedValue(true);
    await expect(
      service.request(
        { channel: 'EMAIL', destination: 'not-an-email', name: 'Anjali' },
        undefined,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    // Order matters: during a freeze even a malformed address is told signups
    // are closed, not that its shape is wrong.
    expect(m.otpChallenge.findUnique).not.toHaveBeenCalled();
    expect(m.otpChallenge.upsert).not.toHaveBeenCalled();
  });

  it('mints a 64-hex signupId on the first request and echoes it back', async () => {
    const out = await service.request(
      { channel: 'EMAIL', destination: 'me@example.com', name: 'Anjali' },
      '127.0.0.1',
    );
    expect(out.signupId).toMatch(/^[0-9a-f]{64}$/);
    expect(m.otpChallenge.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { signupId_channel: { signupId: out.signupId, channel: 'EMAIL' } },
      }),
    );
  });

  it('reuses the supplied signupId, and treats a blank one as absent', async () => {
    const withId = await service.request(
      { signupId: SIGNUP_ID, channel: 'PHONE', destination: '+91 98765 43210', name: 'Anjali' },
      undefined,
    );
    expect(withId.signupId).toBe(SIGNUP_ID);

    const blank = await service.request(
      { signupId: '', channel: 'PHONE', destination: '+91 98765 43210', name: 'Anjali' },
      undefined,
    );
    expect(blank.signupId).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates a 6-digit zero-padded code from crypto.randomInt', async () => {
    await service.request({ channel: 'EMAIL', destination: 'me@example.com', name: 'A' }, undefined);
    expect(mockedRandomInt).toHaveBeenCalledWith(0, 1_000_000);
    const args = m.otpChallenge.upsert.mock.calls[0]?.[0] as {
      create: { code: string };
      update: { code: string };
    };
    // randomInt pinned to 42 — the padding is what keeps a low draw a valid
    // 6-digit code instead of "42".
    expect(args.create.code).toBe('000042');
    // Both branches carry the SAME secret; only one of them ever runs.
    expect(args.update.code).toBe('000042');
  });

  it('sets expiresAt to now + 15 minutes and reports the 30s resend window', async () => {
    const out = await service.request(
      { channel: 'EMAIL', destination: 'me@example.com', name: 'A' },
      undefined,
    );
    const args = m.otpChallenge.upsert.mock.calls[0]?.[0] as {
      create: { expiresAt: Date; lastSentAt: Date };
    };
    expect(args.create.expiresAt.getTime()).toBe(NOW.getTime() + 15 * 60 * 1000);
    expect(args.create.lastSentAt.getTime()).toBe(NOW.getTime());
    expect(out.expiresAt).toBe(new Date(NOW.getTime() + OTP_TTL_MS).toISOString());
    expect(out.resendAvailableAt).toBe(
      new Date(NOW.getTime() + OTP_RESEND_COOLDOWN_MS).toISOString(),
    );
  });

  it('records the caller IP for abuse triage', async () => {
    await service.request(
      { channel: 'EMAIL', destination: 'me@example.com', name: 'A' },
      '203.0.113.9',
    );
    const args = m.otpChallenge.upsert.mock.calls[0]?.[0] as { create: { ipAddress: string | null } };
    expect(args.create.ipAddress).toBe('203.0.113.9');
  });

  it.each([
    ['EMAIL' as const, 'not-an-email'],
    ['EMAIL' as const, 'a@b'],
    ['PHONE' as const, 'call me'],
    ['PHONE' as const, '12345'],
  ])('rejects a %s destination of %p', async (channel, destination) => {
    await expect(
      service.request({ channel, destination, name: 'A' }, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(m.otpChallenge.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ['EMAIL' as const, 'me@example.com'],
    ['PHONE' as const, '+91 98765 43210'],
    ['PHONE' as const, '(022) 2345-6789'],
  ])('accepts a %s destination of %p', async (channel, destination) => {
    await expect(
      service.request({ channel, destination, name: 'A' }, undefined),
    ).resolves.toBeDefined();
  });

  it('429s inside the 30s cooldown, carrying a server-side resendAvailableAt', async () => {
    const lastSentAt = new Date(NOW.getTime() - 10_000); // 10s ago
    m.otpChallenge.findUnique.mockResolvedValue({ lastSentAt, resendCount: 0 });

    const err = await service
      .request(
        { signupId: SIGNUP_ID, channel: 'EMAIL', destination: 'me@example.com', name: 'A' },
        undefined,
      )
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HttpException);
    const res = (err as HttpException).getResponse() as { resendAvailableAt: string };
    expect((err as HttpException).getStatus()).toBe(429);
    expect(res.resendAvailableAt).toBe(
      new Date(lastSentAt.getTime() + OTP_RESEND_COOLDOWN_MS).toISOString(),
    );
    expect(m.otpChallenge.upsert).not.toHaveBeenCalled();
  });

  it('allows a resend once the cooldown has elapsed', async () => {
    m.otpChallenge.findUnique.mockResolvedValue({
      lastSentAt: new Date(NOW.getTime() - OTP_RESEND_COOLDOWN_MS),
      resendCount: 1,
    });
    await expect(
      service.request(
        { signupId: SIGNUP_ID, channel: 'EMAIL', destination: 'me@example.com', name: 'A' },
        undefined,
      ),
    ).resolves.toBeDefined();
  });

  it('429s once the row has already produced 5 codes', async () => {
    m.otpChallenge.findUnique.mockResolvedValue({
      lastSentAt: new Date(NOW.getTime() - 60_000), // cooldown long past
      resendCount: OTP_MAX_RESENDS,
    });
    const err = await service
      .request(
        { signupId: SIGNUP_ID, channel: 'PHONE', destination: '+91 98765 43210', name: 'A' },
        undefined,
      )
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);
    expect((err as HttpException).getResponse()).toBe('Too many codes requested for this number.');
    expect(m.otpChallenge.upsert).not.toHaveBeenCalled();
  });

  it('a resend clears the attempt budget and the verified flag, and counts up', async () => {
    m.otpChallenge.findUnique.mockResolvedValue({
      lastSentAt: new Date(NOW.getTime() - 60_000),
      resendCount: 2,
    });
    await service.request(
      { signupId: SIGNUP_ID, channel: 'EMAIL', destination: 'me@example.com', name: 'A' },
      undefined,
    );
    const args = m.otpChallenge.upsert.mock.calls[0]?.[0] as { update: Record<string, unknown> };
    // A brand-new secret: guesses against the old one are irrelevant, and a
    // channel verified against the old code is no longer verified.
    expect(args.update['attempts']).toBe(0);
    expect(args.update['verifiedAt']).toBeNull();
    // Atomic increment so two resends racing cannot both write "3".
    expect(args.update['resendCount']).toEqual({ increment: 1 });
  });

  // The whole point of the endpoint's design: it must be impossible to learn
  // from a 202 whether the address is already an account.
  it('never consults the User table (no enumeration oracle)', async () => {
    // The mocked client exposes otpChallenge and nothing else, so a
    // `prisma.user.*` lookup anywhere on this path would throw a TypeError
    // rather than quietly passing. An address that already has an account and
    // one that does not therefore travel the identical code path — which is
    // what makes the 202 they both get uninformative.
    expect(prisma).not.toHaveProperty('user');
    await expect(
      service.request({ channel: 'EMAIL', destination: 'me@example.com', name: 'A' }, undefined),
    ).resolves.toMatchObject({ signupId: expect.any(String) });
  });
});

describe('RecruiterOtpService.verify', () => {
  let service: RecruiterOtpService;

  // A live, unverified challenge holding the code "123456".
  function liveRow(over: Record<string, unknown> = {}) {
    return {
      id: 7,
      code: '123456',
      expiresAt: new Date(NOW.getTime() + 60_000),
      attempts: 0,
      verifiedAt: null,
      ...over,
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    m.otpChallenge.update.mockResolvedValue({ attempts: 1 });
    service = new RecruiterOtpService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('400s when no code was ever requested for that channel', async () => {
    m.otpChallenge.findUnique.mockResolvedValue(null);
    await expect(
      service.verify({ signupId: SIGNUP_ID, channel: 'EMAIL', code: '123456' }),
    ).rejects.toThrow('Request a code first.');
  });

  it('accepts the correct code and stamps verifiedAt', async () => {
    m.otpChallenge.findUnique.mockResolvedValue(liveRow());
    await expect(
      service.verify({ signupId: SIGNUP_ID, channel: 'EMAIL', code: '123456' }),
    ).resolves.toEqual({ verified: true });
    expect(m.otpChallenge.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { verifiedAt: NOW },
    });
  });

  it('is idempotent — re-verifying an already-verified channel is a 200 no-op', async () => {
    m.otpChallenge.findUnique.mockResolvedValue(
      // Expired AND already verified: a tick earned inside the window survives
      // the code ageing out, so a slow registrant does not lose it.
      liveRow({ verifiedAt: new Date(NOW.getTime() - 1000), expiresAt: new Date(NOW.getTime() - 1) }),
    );
    await expect(
      service.verify({ signupId: SIGNUP_ID, channel: 'EMAIL', code: '123456' }),
    ).resolves.toEqual({ verified: true });
    expect(m.otpChallenge.update).not.toHaveBeenCalled();
  });

  it('400s on an expired code without spending an attempt', async () => {
    m.otpChallenge.findUnique.mockResolvedValue(
      liveRow({ expiresAt: new Date(NOW.getTime() - 1) }),
    );
    await expect(
      service.verify({ signupId: SIGNUP_ID, channel: 'EMAIL', code: '123456' }),
    ).rejects.toThrow('That code has expired. Request a new one.');
    expect(m.otpChallenge.update).not.toHaveBeenCalled();
  });

  it('refuses even the CORRECT code once the 5-attempt budget is burnt', async () => {
    m.otpChallenge.findUnique.mockResolvedValue(liveRow({ attempts: OTP_MAX_ATTEMPTS }));
    await expect(
      service.verify({ signupId: SIGNUP_ID, channel: 'EMAIL', code: '123456' }),
    ).rejects.toThrow('Too many incorrect attempts. Request a new code.');
    // Otherwise an attacker who guesses right on try 6 still wins.
    expect(m.otpChallenge.update).not.toHaveBeenCalled();
  });

  it('increments attempts ATOMICALLY on a wrong code', async () => {
    m.otpChallenge.findUnique.mockResolvedValue(liveRow({ attempts: 2 }));
    m.otpChallenge.update.mockResolvedValue({ attempts: 3 });
    await expect(
      service.verify({ signupId: SIGNUP_ID, channel: 'EMAIL', code: '999999' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // `{ increment: 1 }`, not `attempts: row.attempts + 1` — two guesses landing
    // together must cost two attempts.
    expect(m.otpChallenge.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
  });

  // The remaining count is derived from the value the DB reports AFTER the
  // increment, so a concurrent guess is reflected rather than overwritten.
  it.each([
    [1, '4 attempts left.'],
    [3, '2 attempts left.'],
    [4, '1 attempt left.'],
    [5, '0 attempts left.'],
  ])('reports the remaining budget after the increment lands on %i', async (after, expected) => {
    m.otpChallenge.findUnique.mockResolvedValue(liveRow({ attempts: after - 1 }));
    m.otpChallenge.update.mockResolvedValue({ attempts: after });
    await expect(
      service.verify({ signupId: SIGNUP_ID, channel: 'EMAIL', code: '999999' }),
    ).rejects.toThrow(`That code is incorrect. ${expected}`);
  });

  it('never reports a negative budget if attempts somehow overshoot', async () => {
    m.otpChallenge.findUnique.mockResolvedValue(liveRow({ attempts: 4 }));
    m.otpChallenge.update.mockResolvedValue({ attempts: 9 });
    await expect(
      service.verify({ signupId: SIGNUP_ID, channel: 'EMAIL', code: '999999' }),
    ).rejects.toThrow('That code is incorrect. 0 attempts left.');
  });

  it('rejects a code of the wrong LENGTH without crashing timingSafeEqual', async () => {
    // timingSafeEqual throws on a length mismatch; the guard in front of it is
    // what turns that into an ordinary wrong-code answer.
    m.otpChallenge.findUnique.mockResolvedValue(liveRow());
    m.otpChallenge.update.mockResolvedValue({ attempts: 1 });
    await expect(
      service.verify({ signupId: SIGNUP_ID, channel: 'EMAIL', code: '12345' }),
    ).rejects.toThrow('That code is incorrect. 4 attempts left.');
  });

  it('treats a leading-zero code as significant', async () => {
    m.otpChallenge.findUnique.mockResolvedValue(liveRow({ code: '000042' }));
    await expect(
      service.verify({ signupId: SIGNUP_ID, channel: 'PHONE', code: '000042' }),
    ).resolves.toEqual({ verified: true });
  });
});

describe('RecruiterOtpService.assertVerifiedPair', () => {
  let service: RecruiterOtpService;

  const EMAIL = 'me@example.com';
  const PHONE = '+91 98765 43210';

  function verifiedRows(over: { email?: Record<string, unknown>; phone?: Record<string, unknown> } = {}) {
    return [
      {
        channel: 'EMAIL',
        destination: EMAIL,
        verifiedAt: new Date(NOW.getTime() - 1000),
        expiresAt: new Date(NOW.getTime() + 60_000),
        ...over.email,
      },
      {
        channel: 'PHONE',
        destination: PHONE,
        verifiedAt: new Date(NOW.getTime() - 1000),
        expiresAt: new Date(NOW.getTime() + 60_000),
        ...over.phone,
      },
    ];
  }

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    service = new RecruiterOtpService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes when both channels are verified, live, and match', async () => {
    m.otpChallenge.findMany.mockResolvedValue(verifiedRows());
    await expect(service.assertVerifiedPair(SIGNUP_ID, EMAIL, PHONE)).resolves.toBeUndefined();
    expect(m.otpChallenge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { signupId: SIGNUP_ID } }),
    );
  });

  it('compares the email case-insensitively', async () => {
    m.otpChallenge.findMany.mockResolvedValue(
      verifiedRows({ email: { destination: 'Me@Example.COM' } }),
    );
    await expect(service.assertVerifiedPair(SIGNUP_ID, EMAIL, PHONE)).resolves.toBeUndefined();
  });

  it('rejects a phone that differs only in formatting', async () => {
    // Compared byte-for-byte on purpose: the platform stores phones free-form,
    // so normalising here would accept a number that was never verified.
    m.otpChallenge.findMany.mockResolvedValue(
      verifiedRows({ phone: { destination: '9876543210' } }),
    );
    await expect(service.assertVerifiedPair(SIGNUP_ID, EMAIL, PHONE)).rejects.toThrow(
      'Verify your email address and mobile number before creating your account.',
    );
  });

  // The attack this exists to stop: verify your own address, then submit
  // somebody else's in the register body.
  it('rejects a destination that is not the one that was verified', async () => {
    m.otpChallenge.findMany.mockResolvedValue(verifiedRows());
    await expect(
      service.assertVerifiedPair(SIGNUP_ID, 'victim@example.com', PHONE),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when a channel exists but was never verified', async () => {
    m.otpChallenge.findMany.mockResolvedValue(verifiedRows({ phone: { verifiedAt: null } }));
    await expect(service.assertVerifiedPair(SIGNUP_ID, EMAIL, PHONE)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects when a channel was never requested at all', async () => {
    const [emailOnly] = verifiedRows();
    m.otpChallenge.findMany.mockResolvedValue([emailOnly]);
    await expect(service.assertVerifiedPair(SIGNUP_ID, EMAIL, PHONE)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects when nothing exists for the signupId', async () => {
    m.otpChallenge.findMany.mockResolvedValue([]);
    await expect(service.assertVerifiedPair(SIGNUP_ID, EMAIL, PHONE)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // verify() lets an already-verified channel stay verified past its TTL; this
  // is where a signup that stalled for hours is sent back to the start.
  it('rejects a verified-but-stale challenge', async () => {
    m.otpChallenge.findMany.mockResolvedValue(
      verifiedRows({ email: { expiresAt: new Date(NOW.getTime() - 1) } }),
    );
    await expect(service.assertVerifiedPair(SIGNUP_ID, EMAIL, PHONE)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('gives the same message for every failure mode (no oracle)', async () => {
    const messages: string[] = [];
    for (const rows of [
      [],
      verifiedRows({ phone: { verifiedAt: null } }),
      verifiedRows({ email: { destination: 'other@example.com' } }),
      verifiedRows({ email: { expiresAt: new Date(NOW.getTime() - 1) } }),
    ]) {
      m.otpChallenge.findMany.mockResolvedValue(rows);
      const err = await service
        .assertVerifiedPair(SIGNUP_ID, EMAIL, PHONE)
        .catch((e: unknown) => e as Error);
      messages.push((err as Error).message);
    }
    expect(new Set(messages).size).toBe(1);
  });
});

describe('RecruiterOtpService.assertNewRegistrationsOpen', () => {
  let service: RecruiterOtpService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new RecruiterOtpService();
  });

  it('resolves while the killswitch is OFF (signup live)', async () => {
    mockedFlag.mockResolvedValue(false);
    await expect(service.assertNewRegistrationsOpen()).resolves.toBeUndefined();
    expect(mockedFlag).toHaveBeenCalledWith('killswitch.new_registrations');
  });

  it('throws 503 while the killswitch is ON', async () => {
    mockedFlag.mockResolvedValue(true);
    await expect(service.assertNewRegistrationsOpen()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
