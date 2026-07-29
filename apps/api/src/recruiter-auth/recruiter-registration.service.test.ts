import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    company: { findUnique: vi.fn(), create: vi.fn() },
    recruiter: { create: vi.fn() },
    session: { create: vi.fn() },
    otpChallenge: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('@jobportal/auth', () => ({
  hashPassword: vi.fn(),
  isStrongPassword: vi.fn(),
  hashJti: (jti: string) => `sha256(${jti})`,
  issueTokenPair: vi.fn(),
}));

import { prisma } from '@jobportal/db';
import { hashPassword, isStrongPassword, issueTokenPair } from '@jobportal/auth';
import { RecruiterRegistrationService } from './recruiter-registration.service';
import type { RecruiterOtpService } from './recruiter-otp.service';

const mocked = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  company: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  recruiter: { create: ReturnType<typeof vi.fn> };
  session: { create: ReturnType<typeof vi.fn> };
  otpChallenge: { deleteMany: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};
const mockedStrong = isStrongPassword as ReturnType<typeof vi.fn>;
const mockedHash = hashPassword as ReturnType<typeof vi.fn>;
const mockedIssue = issueTokenPair as ReturnType<typeof vi.fn>;

// The OTP service is the gate in front of registration: the killswitch check
// and the "both channels verified, for these exact values" check. Both are
// tested against the real service in recruiter-otp.service.test.ts; here they
// are faked so the registration path can be exercised on either side of them.
const fakeOtp = {
  assertNewRegistrationsOpen: vi.fn(),
  assertVerifiedPair: vi.fn(),
} as { assertNewRegistrationsOpen: ReturnType<typeof vi.fn>; assertVerifiedPair: ReturnType<typeof vi.fn> };

const validInput = {
  email: 'me@example.com',
  password: 'Sup3rSecret!',
  name: 'Anjali',
  companyName: 'Acme Inc',
  phone: '+91 98765 43210',
  signupId: 'a'.repeat(64),
};

describe('RecruiterRegistrationService.register', () => {
  let service: RecruiterRegistrationService;

  beforeEach(() => {
    vi.resetAllMocks();
    // resetAllMocks wipes BOTH call history AND mockReturnValue, so the
    // module-level defaults need re-establishing every test.
    mockedStrong.mockReturnValue(true);
    mockedHash.mockResolvedValue('hash');
    mockedIssue.mockReturnValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      refreshJti: 'jti',
      refreshExpiresAt: new Date('2026-12-01'),
    });
    fakeOtp.assertNewRegistrationsOpen.mockResolvedValue(undefined);
    fakeOtp.assertVerifiedPair.mockResolvedValue(undefined);
    service = new RecruiterRegistrationService(fakeOtp as unknown as RecruiterOtpService);

    // Default $transaction stub: invoke the callback with the mocked tx so
    // the service's atomic block runs against the same fakes as the outer
    // calls. Tests can override per-call when they need a tx-failure.
    mocked.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
    mocked.session.create.mockResolvedValue({});
    // Both verified rows spent — the happy-path compare-and-swap.
    mocked.otpChallenge.deleteMany.mockResolvedValue({ count: 2 });
  });

  it('is blocked by killswitch.new_registrations (L3) before any other work', async () => {
    fakeOtp.assertNewRegistrationsOpen.mockRejectedValue(new ServiceUnavailableException());
    await expect(
      service.register(validInput, undefined, undefined),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mockedStrong).not.toHaveBeenCalled();
    expect(fakeOtp.assertVerifiedPair).not.toHaveBeenCalled();
    expect(mocked.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a weak password before touching the DB', async () => {
    mockedStrong.mockReturnValue(false);
    await expect(
      service.register(validInput, undefined, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mocked.user.findUnique).not.toHaveBeenCalled();
  });

  it('requires a verified email+phone pair BEFORE the duplicate-email lookup', async () => {
    fakeOtp.assertVerifiedPair.mockRejectedValue(new BadRequestException('verify first'));
    await expect(
      service.register(validInput, undefined, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    // The 409 below is an enumeration oracle by design, so it must sit BEHIND
    // proof of control — the lookup never runs for an unverified caller.
    expect(mocked.user.findUnique).not.toHaveBeenCalled();
    expect(mocked.$transaction).not.toHaveBeenCalled();
  });

  it('checks the pair against the submitted email + phone, not just the signupId', async () => {
    mocked.user.findUnique.mockResolvedValue({ id: 1 });
    await expect(service.register(validInput, undefined, undefined)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(fakeOtp.assertVerifiedPair).toHaveBeenCalledWith(
      validInput.signupId,
      validInput.email,
      validInput.phone,
    );
  });

  it('rejects a duplicate login email with 409', async () => {
    mocked.user.findUnique.mockResolvedValue({ id: 1 });
    await expect(
      service.register(validInput, undefined, undefined),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mocked.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a company name that has no slug-safe characters', async () => {
    mocked.user.findUnique.mockResolvedValue(null);
    await expect(
      service.register({ ...validInput, companyName: '   !!!' }, undefined, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('happy path creates User + a new Company (registrant = OWNER) + Recruiter, all pre-verified', async () => {
    mocked.user.findUnique.mockResolvedValue(null);
    mocked.company.findUnique.mockResolvedValue(null); // slug is free
    mocked.user.create.mockResolvedValue({
      id: 42,
      email: validInput.email,
      name: validInput.name,
      role: 'RECRUITER',
      emailVerified: true,
    });
    mocked.company.create.mockResolvedValue({ id: 7, slug: 'acme-inc' });
    mocked.recruiter.create.mockResolvedValue({ id: 99, userId: 42, companyId: 7 });

    const out = await service.register(validInput, 'ua/1.0', '127.0.0.1');

    expect(out.user.id).toBe(42);
    expect(out.recruiterId).toBe(99);
    expect(out.workEmailVerified).toBe(true);
    expect(out.accessToken).toBe('access');
    expect(out.refreshToken).toBe('refresh');

    // The verified pair is spent inside the transaction, before the account
    // exists — a replay of the same signupId finds nothing left to delete.
    expect(mocked.otpChallenge.deleteMany).toHaveBeenCalledWith({
      where: { signupId: validInput.signupId, verifiedAt: { not: null } },
    });

    // The OTP proved control of BOTH the address and the number, so the account
    // starts fully verified and carries the phone it was verified against.
    expect(mocked.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: validInput.email,
          role: 'RECRUITER',
          phone: validInput.phone,
          phoneVerified: true,
          emailVerified: true,
        }),
      }),
    );
    expect(mocked.company.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { slug: 'acme-inc', name: 'Acme Inc' },
      }),
    );
    // The registrant becomes the company OWNER (SRS §4.9 team RBAC), and the
    // single Email ID is the work email the OTP already verified.
    expect(mocked.recruiter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 42,
          companyId: 7,
          companyRole: 'OWNER',
          workEmailVerified: true,
        }),
      }),
    );
    expect(mocked.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 42,
          refreshTokenHash: 'sha256(jti)',
          deviceInfo: 'ua/1.0',
          ipAddress: '127.0.0.1',
        }),
      }),
    );
  });

  it('never lets the client assert its own verification state', async () => {
    mocked.user.findUnique.mockResolvedValue(null);
    mocked.company.findUnique.mockResolvedValue(null);
    mocked.user.create.mockResolvedValue({
      id: 43,
      email: validInput.email,
      name: validInput.name,
      role: 'RECRUITER',
      emailVerified: true,
    });
    mocked.company.create.mockResolvedValue({ id: 7, slug: 'acme-inc' });
    mocked.recruiter.create.mockResolvedValue({ id: 100, userId: 43, companyId: 7 });

    // A caller smuggling flags past the DTO gets them ignored: the service
    // reads verification off the OtpChallenge rows, never off the payload.
    const smuggled = {
      ...validInput,
      emailVerified: false,
      phoneVerified: false,
      otpVerified: true,
    } as unknown as typeof validInput;
    await service.register(smuggled, undefined, undefined);

    const data = mocked.user.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(data.data['emailVerified']).toBe(true);
    expect(data.data['phoneVerified']).toBe(true);
    expect(data.data).not.toHaveProperty('otpVerified');
  });

  it('rejects self-registration against an EXISTING company slug (invite-only join)', async () => {
    mocked.user.findUnique.mockResolvedValue(null);
    // A company already exists at this slug — joining it is invite-only now.
    mocked.company.findUnique.mockResolvedValue({ id: 1 });

    await expect(
      service.register({ ...validInput, email: 'two@example.com' }, undefined, undefined),
    ).rejects.toBeInstanceOf(ConflictException);
    // No account is created — the tx rolls back before user.create.
    expect(mocked.user.create).not.toHaveBeenCalled();
    expect(mocked.recruiter.create).not.toHaveBeenCalled();
  });

  // The compare-and-swap. deleteMany reporting anything other than 2 means the
  // pair this request thought it held was not there to take — either a
  // concurrent register won the race, or only one channel was ever verified.
  it.each([0, 1, 3])(
    'aborts with 409 when the verified-pair spend removes %i rows instead of 2',
    async (count) => {
      mocked.user.findUnique.mockResolvedValue(null);
      mocked.company.findUnique.mockResolvedValue(null);
      mocked.otpChallenge.deleteMany.mockResolvedValue({ count });

      await expect(
        service.register(validInput, undefined, undefined),
      ).rejects.toBeInstanceOf(ConflictException);
      // Nothing is created — the tx rolls back before user.create.
      expect(mocked.user.create).not.toHaveBeenCalled();
      expect(mocked.recruiter.create).not.toHaveBeenCalled();
    },
  );
});
