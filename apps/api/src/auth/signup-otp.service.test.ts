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
    expect(Object.keys(out).sort()).toEqual(['expiresAt', 'resendAvailableAt', 'signupId']);
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
      expiresAt: new Date(Date.now() + 60_000),
      verifiedAt: null,
    });
    m.otpChallenge.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.verify({ signupId: 's', code: '123456' })).resolves.toEqual({
      verified: true,
    });
    expect(m.otpChallenge.update).toHaveBeenCalled();
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

  it('rejects a verified challenge that has since expired', async () => {
    m.otpChallenge.findUnique.mockResolvedValue({
      destination: 'a@example.com',
      verifiedAt: new Date(),
      expiresAt: new Date(Date.now() - 1000),
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
