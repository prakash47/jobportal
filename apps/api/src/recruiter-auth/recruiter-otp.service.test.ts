import { BadRequestException, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/feature-flags', () => ({ isFlagEnabled: vi.fn() }));
// The interactive transaction hands the callback a client, so the mock exposes
// $transaction alongside the model delegates and (in beforeEach) runs the
// callback against this same object — every tx.* call therefore lands on the
// same spies the assertions read.
vi.mock('@jobportal/db', () => ({
  prisma: {
    otpChallenge: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
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
  OTP_MAX_LIVE_PER_DESTINATION,
  OTP_MAX_RESENDS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  RecruiterOtpService,
} from './recruiter-otp.service';

const m = prisma as unknown as {
  otpChallenge: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  $executeRaw: ReturnType<typeof vi.fn>;
  $transaction: ReturnType<typeof vi.fn>;
};

// vi.resetAllMocks() strips implementations, so the transaction has to be
// re-armed for every test that runs request().
function armTransaction(): void {
  m.$transaction.mockImplementation((fn: (tx: typeof m) => unknown) => fn(m));
}

/** The SQL text of the Nth $executeRaw tagged template, with `?` for each value. */
function rawSql(callIndex: number): string {
  return (m.$executeRaw.mock.calls[callIndex]![0] as string[]).join('?');
}

/** The bound values of the Nth $executeRaw tagged template. */
function rawValues(callIndex: number): unknown[] {
  return m.$executeRaw.mock.calls[callIndex]!.slice(1);
}
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
    armTransaction();
    m.otpChallenge.findUnique.mockResolvedValue(null);
    m.otpChallenge.count.mockResolvedValue(0); // no other live code for this destination
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
    expect(m.$transaction).not.toHaveBeenCalled();
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

  // The resend cap fires on a code path that knows nothing about the channel,
  // so the copy has to be built per channel: "for this number" under the Email
  // ID field describes a field the registrant is not looking at.
  it.each([
    ['PHONE' as const, '+91 98765 43210', 'Too many codes requested for this number.'],
    ['EMAIL' as const, 'me@example.com', 'Too many codes requested for this email address.'],
  ])('429s once the %s row has already produced 5 codes', async (channel, destination, message) => {
    m.otpChallenge.findUnique.mockResolvedValue({
      lastSentAt: new Date(NOW.getTime() - 60_000), // cooldown long past
      resendCount: OTP_MAX_RESENDS,
    });
    const err = await service
      .request({ signupId: SIGNUP_ID, channel, destination, name: 'A' }, undefined)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);
    expect((err as HttpException).getResponse()).toBe(message);
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

  // ---- per-destination bound -------------------------------------------
  // signupId is client-supplied, so every cap keyed on it is a cap the caller
  // can reset by dropping the key. These pin the one bound that is keyed on the
  // address being targeted instead.

  it('counts only the LIVE challenges other signup attempts hold for this destination', async () => {
    await service.request(
      { signupId: SIGNUP_ID, channel: 'EMAIL', destination: 'ceo@bigcorp.com', name: 'A' },
      undefined,
    );
    expect(m.otpChallenge.count).toHaveBeenCalledWith({
      where: {
        channel: 'EMAIL',
        destination: 'ceo@bigcorp.com',
        // Verified rows are short-circuited by verify() and expired ones cannot
        // be guessed against, so neither belongs in a brute-force budget. A row
        // with its attempts spent is NOT excluded — it holds its slot, which is
        // what stops "burn five, start over".
        verifiedAt: null,
        expiresAt: { gt: NOW },
        // Our own row is replaced by the upsert, not added to the total.
        NOT: { signupId: SIGNUP_ID },
      },
    });
  });

  // The regression this bound exists for: omitting signupId used to mint a
  // fresh row, with a fresh live code and a fresh 5-attempt budget, for ANY
  // destination and as often as the per-IP throttle allowed.
  it.each([
    ['EMAIL' as const, 'ceo@bigcorp.com', 'email address'],
    ['PHONE' as const, '+91 98765 43210', 'number'],
  ])(
    'refuses a brand-new %s signup attempt once the destination is at its live cap',
    async (channel, destination, noun) => {
      m.otpChallenge.count.mockResolvedValue(OTP_MAX_LIVE_PER_DESTINATION);
      const err = await service
        .request({ channel, destination, name: 'A' }, undefined) // no signupId → would be a fresh row
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(429);
      expect((err as HttpException).getResponse()).toBe(
        `Too many codes have recently been requested for this ${noun}. Try again in a few minutes.`,
      );
      // No new live code for that destination — the whole point.
      expect(m.otpChallenge.upsert).not.toHaveBeenCalled();
    },
  );

  it('still issues while the destination is one under the cap', async () => {
    m.otpChallenge.count.mockResolvedValue(OTP_MAX_LIVE_PER_DESTINATION - 1);
    await expect(
      service.request({ channel: 'EMAIL', destination: 'ceo@bigcorp.com', name: 'A' }, undefined),
    ).resolves.toBeDefined();
    expect(m.otpChallenge.upsert).toHaveBeenCalled();
  });

  // The cap answers "how many signup codes are in flight for this address",
  // which is true or false regardless of whether an account exists — and it
  // stays that way only because nothing on the path reads the User table (the
  // mocked client has no `user` delegate at all).
  it('reports the destination cap without consulting any account state', async () => {
    m.otpChallenge.count.mockResolvedValue(OTP_MAX_LIVE_PER_DESTINATION);
    const err = await service
      .request({ channel: 'EMAIL', destination: 'ceo@bigcorp.com', name: 'A' }, undefined)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(String((err as HttpException).getResponse())).not.toMatch(/account|registered|exists/i);
    expect(prisma).not.toHaveProperty('user');
  });

  it('folds email case before counting and storing, so a shifted letter cannot reset the cap', async () => {
    await service.request(
      { signupId: SIGNUP_ID, channel: 'EMAIL', destination: 'CEO@BigCorp.com', name: 'A' },
      undefined,
    );
    const countArgs = m.otpChallenge.count.mock.calls[0]?.[0] as { where: { destination: string } };
    expect(countArgs.where.destination).toBe('ceo@bigcorp.com');
    const upsertArgs = m.otpChallenge.upsert.mock.calls[0]?.[0] as {
      create: { destination: string };
      update: { destination: string };
    };
    expect(upsertArgs.create.destination).toBe('ceo@bigcorp.com');
    expect(upsertArgs.update.destination).toBe('ceo@bigcorp.com');
  });

  it('leaves a phone destination byte-for-byte as typed', async () => {
    await service.request(
      { signupId: SIGNUP_ID, channel: 'PHONE', destination: '+91 98765 43210', name: 'A' },
      undefined,
    );
    const upsertArgs = m.otpChallenge.upsert.mock.calls[0]?.[0] as {
      create: { destination: string };
    };
    // assertVerifiedPair compares phones exactly, so normalising here would let
    // a number that was never verified through.
    expect(upsertArgs.create.destination).toBe('+91 98765 43210');
  });

  // ---- atomicity of the request-side gates ------------------------------

  it('runs every gate and the write inside one transaction, behind two advisory locks', async () => {
    await service.request(
      { signupId: SIGNUP_ID, channel: 'EMAIL', destination: 'me@example.com', name: 'A' },
      undefined,
    );
    expect(m.$transaction).toHaveBeenCalledTimes(1);
    expect(m.$executeRaw).toHaveBeenCalledTimes(2);
    for (const i of [0, 1]) {
      expect(rawSql(i)).toContain('pg_advisory_xact_lock');
      expect(rawValues(i)).toHaveLength(2);
    }
    // Both locks are held before anything is read or written; without them the
    // cooldown, the resend cap and the destination cap are all check-then-act.
    const lastLock = Math.max(...m.$executeRaw.mock.invocationCallOrder);
    expect(m.otpChallenge.findUnique.mock.invocationCallOrder[0]!).toBeGreaterThan(lastLock);
    expect(m.otpChallenge.count.mock.invocationCallOrder[0]!).toBeGreaterThan(lastLock);
    expect(m.otpChallenge.upsert.mock.invocationCallOrder[0]!).toBeGreaterThan(lastLock);
  });

  // Regression guard for a defect that reached the branch and that NO
  // mock-based test can observe directly: the locks were originally taken with
  // $queryRaw, and pg_advisory_xact_lock() returns `void`, which Prisma cannot
  // deserialize. Against a real Postgres every call failed with "Failed to
  // deserialize column of type 'void'" — i.e. every OTP request 500'd — while
  // this suite stayed green, because a vi.fn() mock happily returns undefined
  // for any method you ask it for.
  //
  // The guard is structural rather than behavioural: the mocked client
  // deliberately does NOT define $queryRaw, so if the lock ever moves back to
  // it, the service throws "tx.$queryRaw is not a function" and every
  // request() test fails loudly. This test states the invariant so the missing
  // mock key reads as intentional rather than as an oversight to be "fixed".
  it('takes the locks with $executeRaw, never $queryRaw (void is not deserializable)', async () => {
    await service.request(
      { signupId: SIGNUP_ID, channel: 'EMAIL', destination: 'me@example.com', name: 'A' },
      undefined,
    );
    expect(m.$executeRaw).toHaveBeenCalledTimes(2);
    expect((m as unknown as Record<string, unknown>).$queryRaw).toBeUndefined();
  });

  it('gives two different signup attempts for one destination the SAME destination lock', async () => {
    await service.request(
      { signupId: SIGNUP_ID, channel: 'EMAIL', destination: 'ceo@bigcorp.com', name: 'A' },
      undefined,
    );
    await service.request(
      { signupId: 'b'.repeat(64), channel: 'EMAIL', destination: 'ceo@bigcorp.com', name: 'A' },
      undefined,
    );
    // Lock 0 is keyed on the signup handle and must differ; lock 1 is keyed on
    // the destination and must match, or two concurrent attempts on the same
    // address would never serialise and the cap could be raced past.
    expect(rawValues(0)).not.toEqual(rawValues(2));
    expect(rawValues(1)).toEqual(rawValues(3));
  });

  it('gives different destinations different locks (no needless serialisation)', async () => {
    await service.request(
      { signupId: SIGNUP_ID, channel: 'EMAIL', destination: 'a@example.com', name: 'A' },
      undefined,
    );
    await service.request(
      { signupId: SIGNUP_ID, channel: 'EMAIL', destination: 'b@example.com', name: 'A' },
      undefined,
    );
    expect(rawValues(1)).not.toEqual(rawValues(3));
  });

  it('lets a cap 429 reject out of the transaction rather than swallowing it', async () => {
    m.otpChallenge.count.mockResolvedValue(OTP_MAX_LIVE_PER_DESTINATION);
    await expect(
      service.request({ channel: 'EMAIL', destination: 'ceo@bigcorp.com', name: 'A' }, undefined),
    ).rejects.toBeInstanceOf(HttpException);
    // Load-bearing beyond the status code: the locks are taken with
    // pg_advisory_xact_lock, which the database releases on the ROLLBACK this
    // rejection causes. A swallowed throw would both hold the locks and answer
    // 202 with no row written.
    expect(m.$transaction).toHaveBeenCalledTimes(1);
    expect(m.otpChallenge.upsert).not.toHaveBeenCalled();
  });

  // The whole point of the endpoint's design: it must be impossible to learn
  // from a 202 whether the address is already an account.
  it('never consults the User table (no enumeration oracle)', async () => {
    // The mocked client exposes the otpChallenge delegate and the two
    // transaction primitives, and no other model, so a `prisma.user.*` lookup
    // anywhere on this path would throw a TypeError rather than quietly
    // passing. An address that already has an account and one that does not
    // therefore travel the identical code path — which is what makes the 202
    // they both get uninformative.
    expect(prisma).not.toHaveProperty('user');
    await expect(
      service.request({ channel: 'EMAIL', destination: 'me@example.com', name: 'A' }, undefined),
    ).resolves.toMatchObject({ signupId: expect.any(String) });
  });
});

describe('RecruiterOtpService.verify', () => {
  let service: RecruiterOtpService;

  // A live, unverified challenge holding the code "123456".
  //
  // It deliberately carries NO `attempts`: the service does not select the
  // column any more, because gating on a value read by an earlier SELECT is the
  // check-then-act this file now exists to prevent. The budget is decided
  // solely by what the conditional UPDATE reports.
  function liveRow(over: Record<string, unknown> = {}) {
    return {
      id: 7,
      code: '123456',
      expiresAt: new Date(NOW.getTime() + 60_000),
      verifiedAt: null,
      ...over,
    };
  }

  /** Arrange the row read, the outcome of the attempt claim, and the read-back. */
  function arrangeVerify(
    row: Record<string, unknown> | null,
    claim: { count: number },
    attemptsAfter?: number,
  ) {
    m.otpChallenge.findUnique.mockReset();
    m.otpChallenge.findUnique.mockResolvedValueOnce(row);
    if (attemptsAfter !== undefined) {
      m.otpChallenge.findUnique.mockResolvedValueOnce({ attempts: attemptsAfter });
    }
    m.otpChallenge.updateMany.mockResolvedValue(claim);
  }

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    m.otpChallenge.updateMany.mockResolvedValue({ count: 1 });
    m.otpChallenge.update.mockResolvedValue({});
    service = new RecruiterOtpService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('400s when no code was ever requested for that channel', async () => {
    arrangeVerify(null, { count: 1 });
    await expect(
      service.verify({ signupId: SIGNUP_ID, channel: 'EMAIL', code: '123456' }),
    ).rejects.toThrow('Request a code first.');
    expect(m.otpChallenge.updateMany).not.toHaveBeenCalled();
  });

  it('accepts the correct code and stamps verifiedAt', async () => {
    arrangeVerify(liveRow(), { count: 1 });
    await expect(
      service.verify({ signupId: SIGNUP_ID, channel: 'EMAIL', code: '123456' }),
    ).resolves.toEqual({ verified: true });
    expect(m.otpChallenge.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { verifiedAt: NOW },
    });
  });

  it('is idempotent — re-verifying an already-verified channel is a 200 no-op', async () => {
    arrangeVerify(
      // Expired AND already verified: a tick earned inside the window survives
      // the code ageing out, so a slow registrant does not lose it.
      liveRow({ verifiedAt: new Date(NOW.getTime() - 1000), expiresAt: new Date(NOW.getTime() - 1) }),
      { count: 1 },
    );
    await expect(
      service.verify({ signupId: SIGNUP_ID, channel: 'EMAIL', code: '123456' }),
    ).resolves.toEqual({ verified: true });
    expect(m.otpChallenge.updateMany).not.toHaveBeenCalled();
    expect(m.otpChallenge.update).not.toHaveBeenCalled();
  });

  it('400s on an expired code without spending an attempt', async () => {
    arrangeVerify(liveRow({ expiresAt: new Date(NOW.getTime() - 1) }), { count: 1 });
    await expect(
      service.verify({ signupId: SIGNUP_ID, channel: 'EMAIL', code: '123456' }),
    ).rejects.toThrow('That code has expired. Request a new one.');
    expect(m.otpChallenge.updateMany).not.toHaveBeenCalled();
    expect(m.otpChallenge.update).not.toHaveBeenCalled();
  });

  // ---- the attempt cap is a conditional write, not a check-then-act ------

  it('claims an attempt slot with a conditional UPDATE before comparing anything', async () => {
    arrangeVerify(liveRow(), { count: 1 });
    await service.verify({ signupId: SIGNUP_ID, channel: 'EMAIL', code: '123456' });
    // The `attempts < max` predicate lives in the statement, so the row hands
    // out at most OTP_MAX_ATTEMPTS slots no matter how many callers race.
    expect(m.otpChallenge.updateMany).toHaveBeenCalledWith({
      where: { id: 7, attempts: { lt: OTP_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    // Claimed BEFORE the comparison — a correct guess spends a slot too, which
    // is what stops a burst exhausting the budget with wrong guesses while a
    // concurrent right one slips past on the same stale snapshot.
    expect(m.otpChallenge.updateMany.mock.invocationCallOrder[0]!).toBeLessThan(
      m.otpChallenge.update.mock.invocationCallOrder[0]!,
    );
  });

  it('refuses even the CORRECT code when the claim loses the race (count 0)', async () => {
    // The service never read `attempts`; losing the conditional UPDATE is the
    // ONLY signal that the budget is gone, and it is decided by the database.
    arrangeVerify(liveRow(), { count: 0 });
    await expect(
      service.verify({ signupId: SIGNUP_ID, channel: 'EMAIL', code: '123456' }),
    ).rejects.toThrow('Too many incorrect attempts. Request a new code.');
    // Otherwise an attacker who guesses right on try 6 still wins.
    expect(m.otpChallenge.update).not.toHaveBeenCalled();
  });

  it('does not gate on the attempts value carried by the earlier SELECT', async () => {
    // A snapshot that says the budget is spent, and a claim that says it is
    // not: the claim wins, because it is the one the DB evaluated at write
    // time. Concurrent verifies all share the pre-write snapshot, so trusting
    // it would hand every one of them a free guess.
    arrangeVerify(liveRow({ attempts: OTP_MAX_ATTEMPTS + 3 }), { count: 1 });
    await expect(
      service.verify({ signupId: SIGNUP_ID, channel: 'EMAIL', code: '123456' }),
    ).resolves.toEqual({ verified: true });
  });

  // The remaining count is read back AFTER the claim, so a concurrent guess is
  // reflected rather than overwritten.
  it.each([
    [1, '4 attempts left.'],
    [3, '2 attempts left.'],
    [4, '1 attempt left.'],
    [5, '0 attempts left.'],
  ])('reports the remaining budget once the counter reaches %i', async (after, expected) => {
    arrangeVerify(liveRow(), { count: 1 }, after);
    await expect(
      service.verify({ signupId: SIGNUP_ID, channel: 'EMAIL', code: '999999' }),
    ).rejects.toThrow(`That code is incorrect. ${expected}`);
  });

  it('never reports a negative budget if attempts somehow overshoot', async () => {
    arrangeVerify(liveRow(), { count: 1 }, 9);
    await expect(
      service.verify({ signupId: SIGNUP_ID, channel: 'EMAIL', code: '999999' }),
    ).rejects.toThrow('That code is incorrect. 0 attempts left.');
  });

  it('reports zero left if the row vanished between the claim and the read-back', async () => {
    // A purge or a register-time delete can remove the row mid-flight; the
    // budget was already enforced by the claim, so the message just errs on the
    // side of "nothing left" rather than crashing.
    arrangeVerify(liveRow(), { count: 1 });
    m.otpChallenge.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.verify({ signupId: SIGNUP_ID, channel: 'EMAIL', code: '999999' }),
    ).rejects.toThrow('That code is incorrect. 0 attempts left.');
  });

  it('rejects a code of the wrong LENGTH without crashing timingSafeEqual', async () => {
    // timingSafeEqual throws on a length mismatch; the guard in front of it is
    // what turns that into an ordinary wrong-code answer.
    arrangeVerify(liveRow(), { count: 1 }, 1);
    await expect(
      service.verify({ signupId: SIGNUP_ID, channel: 'EMAIL', code: '12345' }),
    ).rejects.toThrow('That code is incorrect. 4 attempts left.');
  });

  it('treats a leading-zero code as significant', async () => {
    arrangeVerify(liveRow({ code: '000042' }), { count: 1 });
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
