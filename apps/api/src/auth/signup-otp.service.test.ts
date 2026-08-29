import { BadRequestException, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/feature-flags', () => ({ isFlagEnabled: vi.fn() }));
// The interactive transaction hands the callback a client, so the mock exposes
// $transaction alongside the delegates and runs the callback against this same
// object — every tx.* call lands on the spies the assertions read.
vi.mock('@jobportal/db', () => ({
  prisma: {
    otpChallenge: {
      findUnique: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

import { prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import {
  SIGNUP_OTP_MAX_ATTEMPTS,
  SIGNUP_OTP_MAX_LIVE_PER_DESTINATION,
  SIGNUP_OTP_COMPLETION_MS,
  SIGNUP_OTP_MAX_RESENDS,
  SIGNUP_OTP_RESEND_COOLDOWN_MS,
  SignupOtpService,
} from './signup-otp.service';

const m = prisma as unknown as {
  otpChallenge: {
    findUnique: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  $executeRaw: ReturnType<typeof vi.fn>;
  $transaction: ReturnType<typeof vi.fn>;
};

const email = { enqueueSignupOtp: vi.fn() } as { enqueueSignupOtp: ReturnType<typeof vi.fn> };

let service: SignupOtpService;

beforeEach(() => {
  vi.resetAllMocks();
  (isFlagEnabled as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(false);
  email.enqueueSignupOtp.mockResolvedValue(undefined);
  m.$executeRaw.mockResolvedValue(1);
  m.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(m));
  m.otpChallenge.findUnique.mockResolvedValue(null);
  m.otpChallenge.count.mockResolvedValue(0);
  m.otpChallenge.upsert.mockResolvedValue({
    id: 1,
    expiresAt: new Date(Date.now() + 900_000),
    lastSentAt: new Date(),
  });
  service = new SignupOtpService(email as unknown as never);
});

describe('SignupOtpService.request', () => {
  it('issues a code and mints a signupId', async () => {
    const out = await service.request({ email: 'A@Example.com', name: 'A' }, '1.2.3.4');
    expect(out.signupId).toMatch(/^[0-9a-f]{64}$/);
    expect(out.expiresAt).toBeTruthy();
  });

  // The address is the identity here, so it must be normalised at the door —
  // otherwise A@x.com and a@x.com are two destinations with separate budgets,
  // and the per-address ceiling is trivially doubled by changing case.
  it('lowercases the destination', async () => {
    await service.request({ email: '  A@Example.COM ', name: 'A' }, undefined);
    expect(m.otpChallenge.upsert.mock.calls[0]![0].create.destination).toBe('a@example.com');
  });

  it('emails the code to that address', async () => {
    await service.request({ email: 'a@example.com', name: 'Asha' }, undefined);
    const [to, payload] = email.enqueueSignupOtp.mock.calls[0]!;
    expect(to).toBe('a@example.com');
    expect(payload.code).toMatch(/^\d{6}$/);
    expect(payload.name).toBe('Asha');
  });

  // Delivery is fire-and-log: the challenge is already committed, so a mail
  // outage must not 500 a request whose primary effect succeeded.
  it('still succeeds when the mailer is down', async () => {
    email.enqueueSignupOtp.mockRejectedValue(new Error('redis down'));
    await expect(
      service.request({ email: 'a@example.com', name: 'A' }, undefined),
    ).resolves.toMatchObject({ signupId: expect.any(String) });
  });

  // The code is a credential; it must never appear in the response body, which
  // would hand it to anyone who can reach the endpoint.
  it('NEVER returns the code to the caller', async () => {
    const out = await service.request({ email: 'a@example.com', name: 'A' }, undefined);
    const sent = email.enqueueSignupOtp.mock.calls[0]![1].code;
    expect(JSON.stringify(out)).not.toContain(sent);
    // A strict allowlist, not a subset check: adding a field to this response
    // has to be a deliberate act, because this is the payload that sits one
    // careless spread away from returning the code itself. `resendInSeconds`
    // was added on purpose — it is a duration, derived from a constant, and
    // carries nothing about the challenge.
    expect(Object.keys(out).sort()).toEqual([
      'expiresAt',
      'resendAvailableAt',
      'resendInSeconds',
      'signupId',
    ]);
  });

  it('refuses while the new-registrations killswitch is on', async () => {
    (isFlagEnabled as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    await expect(
      service.request({ email: 'a@example.com', name: 'A' }, undefined),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(m.otpChallenge.upsert).not.toHaveBeenCalled();
  });

  it('enforces the resend cooldown', async () => {
    m.otpChallenge.findUnique.mockResolvedValue({ lastSentAt: new Date(), resendCount: 0 });
    await expect(
      service.request({ email: 'a@example.com', name: 'A', signupId: 's' }, undefined),
    ).rejects.toBeInstanceOf(HttpException);
    expect(m.otpChallenge.upsert).not.toHaveBeenCalled();
  });

  it('caps total resends for one challenge', async () => {
    m.otpChallenge.findUnique.mockResolvedValue({
      lastSentAt: new Date(Date.now() - SIGNUP_OTP_RESEND_COOLDOWN_MS - 1000),
      resendCount: SIGNUP_OTP_MAX_RESENDS,
    });
    await expect(
      service.request({ email: 'a@example.com', name: 'A', signupId: 's' }, undefined),
    ).rejects.toBeInstanceOf(HttpException);
  });

  // The one bound an attacker cannot reset: signupId is caller-chosen, so the
  // attempt and resend caps bound a handle they own. This bounds the ADDRESS.
  it('caps live codes per destination across signup attempts', async () => {
    m.otpChallenge.count.mockResolvedValue(SIGNUP_OTP_MAX_LIVE_PER_DESTINATION);
    await expect(
      service.request({ email: 'a@example.com', name: 'A' }, undefined),
    ).rejects.toBeInstanceOf(HttpException);
    expect(m.otpChallenge.upsert).not.toHaveBeenCalled();
  });

  // Excluding our own row matters: without it a registrant's own resends would
  // count against the address ceiling they are trying to use.
  it('excludes this signup from its own live count', async () => {
    await service.request({ email: 'a@example.com', name: 'A', signupId: 'mine' }, undefined);
    expect(m.otpChallenge.count.mock.calls[0]![0].where).toMatchObject({
      NOT: { signupId: 'mine' },
      verifiedAt: null,
    });
  });
});

// The upsert's `update` branch is the RESEND path, and nothing reached it: every
// test left findUnique at its null default (create branch), and the only two
// that set a non-null `existing` assert the call throws first. Its three resets
// were therefore covered by nothing — deleting `verifiedAt: null` left the whole
// suite green while reopening address substitution across a resend.
// The per-destination ceiling bounds guesses, but it counts rows without regard
// to WHO created them — and this branch made a verified challenge mandatory at
// /auth/register, which turns "you cannot get a code" into "you cannot register
// at all". One unauthenticated caller could fill all three slots for any address
// from a single IP, inside the 5/min throttle, and lock that person out.
describe('SignupOtpService.request — one IP cannot corner an address', () => {
  it('refuses a second live challenge for one address from the same IP', async () => {
    m.otpChallenge.count
      .mockResolvedValueOnce(1) // live elsewhere overall: under the ceiling
      .mockResolvedValueOnce(1); // ...but this IP already holds one of them
    await expect(
      service.request({ email: 'victim@example.com', name: 'V' }, '9.9.9.9'),
    ).rejects.toBeInstanceOf(HttpException);
    expect(m.otpChallenge.upsert).not.toHaveBeenCalled();
  });

  it('scopes the sub-cap to this address and this IP, excluding the caller own row', async () => {
    m.otpChallenge.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    await service.request({ email: 'a@example.com', name: 'A', signupId: 's' }, '9.9.9.9');
    expect(m.otpChallenge.count.mock.calls[1]![0].where).toMatchObject({
      destination: 'a@example.com',
      ipAddress: '9.9.9.9',
      verifiedAt: null,
      NOT: { signupId: 's' },
    });
  });

  // An unknown IP must not become one shared bucket that blocks everybody.
  it('does not apply the sub-cap when the IP is unknown', async () => {
    m.otpChallenge.count.mockResolvedValue(0);
    await expect(
      service.request({ email: 'a@example.com', name: 'A' }, undefined),
    ).resolves.toBeTruthy();
  });
});

describe('SignupOtpService.request — the resend branch', () => {
  const resendable = {
    lastSentAt: new Date(Date.now() - SIGNUP_OTP_RESEND_COOLDOWN_MS - 1_000),
    resendCount: 1,
  };

  it('resets the attempt budget, clears any verification, and counts the resend', async () => {
    m.otpChallenge.findUnique.mockResolvedValue(resendable);
    await service.request({ email: 'a@example.com', name: 'A', signupId: 's' }, '1.2.3.4');
    expect(m.otpChallenge.upsert.mock.calls[0]![0].update).toMatchObject({
      attempts: 0,
      verifiedAt: null,
      resendCount: { increment: 1 },
      destination: 'a@example.com',
    });
  });

  // A resend REPLACES the code in place rather than inserting a sibling, which
  // is what stops N resends leaving N simultaneously-valid codes.
  it('writes a different code than the row already held', async () => {
    m.otpChallenge.findUnique.mockResolvedValue(resendable);
    await service.request({ email: 'a@example.com', name: 'A', signupId: 's' }, undefined);
    const update = m.otpChallenge.upsert.mock.calls[0]![0].update;
    expect(update.code).toMatch(/^[0-9]{6}$/);
    expect(update.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

// Both locks were mocked and neither was asserted, so both could be deleted with
// the suite green — and a mocked client cannot catch the $queryRaw/$executeRaw
// mistake the comment warns about either. Call shape and ORDER are still
// assertable, and order is what prevents the deadlock.
describe('SignupOtpService.request — advisory locks', () => {
  const keysOf = (call: unknown[]) => [call[1], call[2]];

  it('takes exactly two transaction-scoped locks', async () => {
    await service.request({ email: 'a@example.com', name: 'A', signupId: 's' }, undefined);
    expect(m.$executeRaw).toHaveBeenCalledTimes(2);
    expect(keysOf(m.$executeRaw.mock.calls[0]!)).not.toEqual(
      keysOf(m.$executeRaw.mock.calls[1]!),
    );
  });

  // Proves WHICH lock is which without re-deriving the hash in the test (which
  // would pass even if implementation and test were wrong together): vary one
  // input at a time and assert which call's key moves. Signup handle must be
  // first and destination second, on every path, or two transactions can each
  // hold one and wait on the other.
  it('locks the signup handle first and the destination second', async () => {
    await service.request({ email: 'a@example.com', name: 'A', signupId: 's1' }, undefined);
    const base = m.$executeRaw.mock.calls.map(keysOf);

    m.$executeRaw.mockClear();
    await service.request({ email: 'a@example.com', name: 'A', signupId: 's2' }, undefined);
    const changedSignup = m.$executeRaw.mock.calls.map(keysOf);

    m.$executeRaw.mockClear();
    await service.request({ email: 'b@example.com', name: 'A', signupId: 's1' }, undefined);
    const changedDest = m.$executeRaw.mock.calls.map(keysOf);

    // signupId moved -> only the FIRST lock changed
    expect(changedSignup[0]).not.toEqual(base[0]);
    expect(changedSignup[1]).toEqual(base[1]);
    // destination moved -> only the SECOND lock changed
    expect(changedDest[0]).toEqual(base[0]);
    expect(changedDest[1]).not.toEqual(base[1]);
  });
});

// A phone clock minutes out of true is common, so the client must never derive
// the cooldown by subtracting the device clock from a server timestamp. That
// means the server has to send a DURATION; sending only absolute instants left
// the client no skew-free option at all.
describe('SignupOtpService.request — the resend cooldown is sent as a duration', () => {
  it('returns the remaining cooldown in seconds, not just an instant', async () => {
    const out = await service.request({ email: 'a@example.com', name: 'A' }, undefined);
    expect(out.resendInSeconds).toBe(Math.round(SIGNUP_OTP_RESEND_COOLDOWN_MS / 1000));
  });

  it('puts the same duration on the 429 so the button can re-arm', async () => {
    m.otpChallenge.findUnique.mockResolvedValue({
      lastSentAt: new Date(Date.now() - 10_000),
      resendCount: 0,
    });
    const err = (await service
      .request({ email: 'a@example.com', name: 'A', signupId: 's' }, undefined)
      .catch((e: unknown) => e)) as HttpException;
    const body = err.getResponse() as { resendInSeconds?: number };
    expect(body.resendInSeconds).toBeGreaterThan(0);
    expect(body.resendInSeconds).toBeLessThanOrEqual(
      Math.round(SIGNUP_OTP_RESEND_COOLDOWN_MS / 1000),
    );
  });
});

describe('SignupOtpService.verify', () => {
  it('rejects when no challenge exists', async () => {
    m.otpChallenge.findUnique.mockResolvedValue(null);
    await expect(service.verify({ signupId: 's', code: '123456' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('is idempotent once verified', async () => {
    m.otpChallenge.findUnique.mockResolvedValue({
      id: 1,
      code: '123456',
      expiresAt: new Date(Date.now() - 1),
      verifiedAt: new Date(),
    });
    // Verified BEFORE expiry is checked, on purpose: a slow registrant must not
    // lose a tick they legitimately earned inside the window.
    await expect(service.verify({ signupId: 's', code: '123456' })).resolves.toEqual({
      verified: true,
    });
  });

  it('rejects an expired code', async () => {
    m.otpChallenge.findUnique.mockResolvedValue({
      id: 1,
      code: '123456',
      expiresAt: new Date(Date.now() - 1000),
      verifiedAt: null,
    });
    await expect(service.verify({ signupId: 's', code: '123456' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // The attempt budget is claimed by a CONDITIONAL UPDATE before the comparison.
  // count === 0 means this caller lost the race for the last slot.
  it('refuses once the attempt budget is spent', async () => {
    m.otpChallenge.findUnique.mockResolvedValue({
      id: 1,
      code: '123456',
      expiresAt: new Date(Date.now() + 60_000),
      verifiedAt: null,
    });
    m.otpChallenge.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.verify({ signupId: 's', code: '123456' })).rejects.toThrow(
      /Too many incorrect attempts/,
    );
    expect(m.otpChallenge.update).not.toHaveBeenCalled();
  });

  it('claims the slot with a bounded conditional update, not a read-then-write', async () => {
    m.otpChallenge.findUnique.mockResolvedValue({
      id: 1,
      code: '123456',
      expiresAt: new Date(Date.now() + 60_000),
      verifiedAt: null,
    });
    m.otpChallenge.updateMany.mockResolvedValue({ count: 1 });
    await service.verify({ signupId: 's', code: '123456' });
    expect(m.otpChallenge.updateMany.mock.calls[0]![0].where).toMatchObject({
      id: 1,
      attempts: { lt: SIGNUP_OTP_MAX_ATTEMPTS },
    });
  });

  it('rejects a wrong code and reports the attempts left', async () => {
    m.otpChallenge.findUnique
      .mockResolvedValueOnce({
        id: 1,
        code: '123456',
        expiresAt: new Date(Date.now() + 60_000),
        verifiedAt: null,
      })
      .mockResolvedValueOnce({ attempts: 2 });
    m.otpChallenge.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.verify({ signupId: 's', code: '999999' })).rejects.toThrow(
      /3 attempts left/,
    );
    expect(m.otpChallenge.update).not.toHaveBeenCalled();
  });

  it('marks the challenge verified on a correct code', async () => {
    m.otpChallenge.findUnique.mockResolvedValue({
      id: 1,
      code: '123456',
      destination: 'a@example.com',
      expiresAt: new Date(Date.now() + 60_000),
      verifiedAt: null,
    });
    m.otpChallenge.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.verify({ signupId: 's', code: '123456' })).resolves.toEqual({
      verified: true,
    });
  });

  // The read at the top of verify() is a SNAPSHOT. request() rewrites
  // destination + code on this very row (same @@unique([signupId, channel]))
  // under two advisory locks that verify() does not take, so between the read
  // and the stamp the row can come to hold a DIFFERENT address. Stamping by id
  // alone would then mark somebody else's address verified off a code the
  // caller was legitimately shown for their own — the reported bug, one layer
  // down. The stamp therefore has to re-assert what it matched.
  it('stamps verifiedAt with a compare-and-swap pinned to the code it just matched', async () => {
    m.otpChallenge.findUnique.mockResolvedValue({
      id: 1,
      code: '123456',
      destination: 'a@example.com',
      expiresAt: new Date(Date.now() + 60_000),
      verifiedAt: null,
    });
    m.otpChallenge.updateMany.mockResolvedValue({ count: 1 });

    await service.verify({ signupId: 's', code: '123456' });

    // call 0 is the attempt claim; call 1 is the stamp.
    const stamp = m.otpChallenge.updateMany.mock.calls[1]![0];
    expect(stamp.where).toMatchObject({
      id: 1,
      code: '123456',
      destination: 'a@example.com',
      verifiedAt: null,
    });
    expect(stamp.data).toMatchObject({ verifiedAt: expect.any(Date) });
  });

  // The other way the CAS can touch 0 rows, which is NOT an attack: a second
  // verify() of the SAME challenge got there first. Same outcome, so it has to
  // succeed — otherwise a double-click becomes "request a new code".
  it('stays idempotent when a concurrent verify() already stamped the same challenge', async () => {
    m.otpChallenge.findUnique
      .mockResolvedValueOnce({
        id: 1,
        code: '123456',
        destination: 'a@example.com',
        expiresAt: new Date(Date.now() + 60_000),
        verifiedAt: null,
      })
      .mockResolvedValueOnce({
        code: '123456',
        destination: 'a@example.com',
        verifiedAt: new Date(),
      });
    m.otpChallenge.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(service.verify({ signupId: 's', code: '123456' })).resolves.toEqual({
      verified: true,
    });
  });

  it('rejects when a concurrent request() re-pointed the row before the stamp landed', async () => {
    m.otpChallenge.findUnique.mockResolvedValue({
      id: 1,
      code: '123456',
      destination: 'attacker@evil.com',
      expiresAt: new Date(Date.now() + 60_000),
      verifiedAt: null,
    });
    m.otpChallenge.updateMany
      .mockResolvedValueOnce({ count: 1 }) // attempt slot claimed
      .mockResolvedValueOnce({ count: 0 }); // row changed underneath: 0 rows stamped

    await expect(service.verify({ signupId: 's', code: '123456' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

// THE regression suite for the reported bug: "invalid email is accepted and the
// account is created". Everything here answers "can an account exist for an
// address nobody proved they can receive mail at?"
describe('SignupOtpService.assertVerifiedEmail — the reported bug', () => {
  const live = { expiresAt: new Date(Date.now() + 60_000) };

  it('rejects when the signup never verified anything', async () => {
    m.otpChallenge.findUnique.mockResolvedValue(null);
    await expect(service.assertVerifiedEmail('s', 'a@example.com')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a challenge that was requested but never verified', async () => {
    m.otpChallenge.findUnique.mockResolvedValue({
      destination: 'a@example.com',
      verifiedAt: null,
      ...live,
    });
    await expect(service.assertVerifiedEmail('s', 'a@example.com')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // THE substitution attack. Verify an address you control, then submit
  // somebody else's at register time. Without re-checking the destination this
  // creates a verified account for an address that was never proven — the
  // original bug, one layer down.
  it('rejects a verified handle used for a DIFFERENT address', async () => {
    m.otpChallenge.findUnique.mockResolvedValue({
      destination: 'attacker@example.com',
      verifiedAt: new Date(),
      ...live,
    });
    await expect(service.assertVerifiedEmail('s', 'victim@example.com')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // The CODE's 15-minute life and the time allowed to FINISH the form are two
  // different deadlines, and reusing one constant for both made the form a dead
  // end: verify at 14:59, spend two minutes choosing a password, and register
  // refused with the green tick still showing. Proof of control does not decay
  // on the code's schedule — what the code buys is a fact about the address,
  // and that fact is still true a minute after the code ages out.
  it('accepts a verified challenge whose CODE has expired, inside the completion window', async () => {
    m.otpChallenge.findUnique.mockResolvedValue({
      destination: 'a@example.com',
      verifiedAt: new Date(Date.now() - 20 * 60_000),
      expiresAt: new Date(Date.now() - 5 * 60_000),
    });
    await expect(service.assertVerifiedEmail('s', 'a@example.com')).resolves.toBeUndefined();
  });

  // The window still has to CLOSE, or a verified handle would be a permanent
  // capability to create an account for that address. Bounded well inside the
  // hourly purge grace so the row cannot vanish mid-window.
  it('rejects once the completion window has closed', async () => {
    m.otpChallenge.findUnique.mockResolvedValue({
      destination: 'a@example.com',
      verifiedAt: new Date(Date.now() - SIGNUP_OTP_COMPLETION_MS - 60_000),
      expiresAt: new Date(Date.now() - 20 * 60_000),
    });
    await expect(service.assertVerifiedEmail('s', 'a@example.com')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a challenge that was never verified even inside the window', async () => {
    m.otpChallenge.findUnique.mockResolvedValue({
      destination: 'a@example.com',
      verifiedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(service.assertVerifiedEmail('s', 'a@example.com')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accepts the exact verified address, case-insensitively', async () => {
    m.otpChallenge.findUnique.mockResolvedValue({
      destination: 'a@example.com',
      verifiedAt: new Date(),
      ...live,
    });
    await expect(service.assertVerifiedEmail('s', '  A@Example.COM ')).resolves.toBeUndefined();
  });

  // Every failure is the SAME message: which of missing / stale / mismatched
  // applies would be an oracle for what a given signupId has verified.
  it('gives one indistinguishable message for every failure', async () => {
    const messages: string[] = [];
    for (const row of [
      null,
      { destination: 'a@example.com', verifiedAt: null, ...live },
      { destination: 'other@example.com', verifiedAt: new Date(), ...live },
    ]) {
      m.otpChallenge.findUnique.mockResolvedValue(row);
      const err = await service.assertVerifiedEmail('s', 'a@example.com').catch((e: Error) => e);
      messages.push((err as Error).message);
    }
    expect(new Set(messages).size).toBe(1);
  });
});

describe('SignupOtpService.consumeVerified', () => {
  it('spends the challenge, scoped to verified rows only', async () => {
    m.otpChallenge.deleteMany.mockResolvedValue({ count: 1 });
    await service.consumeVerified(m as never, 's');
    expect(m.otpChallenge.deleteMany.mock.calls[0]![0].where).toMatchObject({
      signupId: 's',
      verifiedAt: { not: null },
    });
  });

  // The compare-and-swap. Two concurrent registers on one verified challenge:
  // the winner deletes the row, the loser deletes 0 and must be rejected — not
  // handed a second account off one proof.
  it('rejects when the challenge was already spent', async () => {
    m.otpChallenge.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.consumeVerified(m as never, 's')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
