import { BadRequestException, ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    company: { upsert: vi.fn() },
    recruiter: { create: vi.fn() },
    session: { create: vi.fn() },
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

const mocked = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  company: { upsert: ReturnType<typeof vi.fn> };
  recruiter: { create: ReturnType<typeof vi.fn> };
  session: { create: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};
const mockedStrong = isStrongPassword as ReturnType<typeof vi.fn>;
const mockedHash = hashPassword as ReturnType<typeof vi.fn>;
const mockedIssue = issueTokenPair as ReturnType<typeof vi.fn>;

const fakeWorkEmail = {
  issueAndSend: vi.fn().mockResolvedValue(undefined),
} as { issueAndSend: ReturnType<typeof vi.fn> };

const validInput = {
  email: 'me@example.com',
  password: 'Sup3rSecret!',
  name: 'Anjali',
  companyName: 'Acme Inc',
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
    fakeWorkEmail.issueAndSend.mockResolvedValue(undefined);
    service = new RecruiterRegistrationService(fakeWorkEmail as unknown as never);

    // Default $transaction stub: invoke the callback with the mocked tx so
    // the service's atomic block runs against the same fakes as the outer
    // calls. Tests can override per-call when they need a tx-failure.
    mocked.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
    mocked.session.create.mockResolvedValue({});
  });

  it('rejects a weak password before touching the DB', async () => {
    mockedStrong.mockReturnValue(false);
    await expect(
      service.register(validInput, undefined, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mocked.user.findUnique).not.toHaveBeenCalled();
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

  it('happy path creates User + upserts Company + creates Recruiter + sends verification', async () => {
    mocked.user.findUnique.mockResolvedValue(null);
    mocked.user.create.mockResolvedValue({
      id: 42,
      email: validInput.email,
      name: validInput.name,
      role: 'RECRUITER',
      emailVerified: false,
    });
    mocked.company.upsert.mockResolvedValue({ id: 7, slug: 'acme-inc' });
    mocked.recruiter.create.mockResolvedValue({ id: 99, userId: 42, companyId: 7 });

    const out = await service.register(validInput, 'ua/1.0', '127.0.0.1');

    expect(out.user.id).toBe(42);
    expect(out.recruiterId).toBe(99);
    expect(out.workEmailVerified).toBe(false);
    expect(out.accessToken).toBe('access');
    expect(out.refreshToken).toBe('refresh');

    expect(mocked.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: validInput.email, role: 'RECRUITER' }),
      }),
    );
    expect(mocked.company.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: 'acme-inc' },
        create: { slug: 'acme-inc', name: 'Acme Inc' },
      }),
    );
    expect(mocked.recruiter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 42,
          companyId: 7,
          workEmailVerified: false,
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
    // Verification link now goes to the single Email ID (the login address).
    expect(fakeWorkEmail.issueAndSend).toHaveBeenCalledWith(99, 'me@example.com');
  });

  it('slug-collision links the recruiter to the existing Company', async () => {
    mocked.user.findUnique.mockResolvedValue(null);
    mocked.user.create.mockResolvedValue({
      id: 43,
      email: 'two@example.com',
      name: 'Bobby',
      role: 'RECRUITER',
      emailVerified: false,
    });
    // upsert returns the EXISTING row (id=1) for the same slug — no create
    // is performed inside Prisma, but the service does not differentiate.
    mocked.company.upsert.mockResolvedValue({ id: 1, slug: 'acme-inc' });
    mocked.recruiter.create.mockResolvedValue({ id: 100, userId: 43, companyId: 1 });

    const out = await service.register({ ...validInput, email: 'two@example.com' }, undefined, undefined);
    expect(out.recruiterId).toBe(100);
    expect(mocked.recruiter.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ companyId: 1 }) }),
    );
  });

  it('does NOT block on a slow / failing email backend', async () => {
    mocked.user.findUnique.mockResolvedValue(null);
    mocked.user.create.mockResolvedValue({
      id: 50,
      email: validInput.email,
      name: validInput.name,
      role: 'RECRUITER',
      emailVerified: false,
    });
    mocked.company.upsert.mockResolvedValue({ id: 7, slug: 'acme-inc' });
    mocked.recruiter.create.mockResolvedValue({ id: 200, userId: 50, companyId: 7 });
    fakeWorkEmail.issueAndSend.mockRejectedValue(new Error('SMTP down'));

    // Service swallows the email failure (void) — a fire-and-log means
    // registration completes even when Resend is wobbly.
    await expect(
      service.register(validInput, undefined, undefined),
    ).resolves.toBeDefined();
  });
});
