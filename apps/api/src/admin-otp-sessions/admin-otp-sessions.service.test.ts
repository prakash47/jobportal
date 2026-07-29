import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    otpChallenge: { findUnique: vi.fn() },
    profileAuditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  // Referenced only in a type position (`as unknown as Prisma.InputJsonValue`);
  // present so the value import resolves under the mock.
  Prisma: {},
}));

import { prisma } from '@jobportal/db';
import { AdminOtpSessionsService } from './admin-otp-sessions.service';

const m = prisma as unknown as {
  otpChallenge: { findUnique: ReturnType<typeof vi.fn> };
  profileAuditLog: { create: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

const CHALLENGE = {
  id: 31,
  code: '482913',
  channel: 'PHONE',
  destination: '+91 98765 43210',
  expiresAt: new Date('2026-07-29T10:15:00.000Z'),
  verifiedAt: null,
};

describe('AdminOtpSessionsService.reveal', () => {
  let service: AdminOtpSessionsService;

  beforeEach(() => {
    vi.resetAllMocks();
    m.otpChallenge.findUnique.mockResolvedValue({ ...CHALLENGE });
    m.profileAuditLog.create.mockResolvedValue({});
    // Run the atomic block against the same mocked prisma (tx === prisma).
    m.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
    service = new AdminOtpSessionsService();
  });

  it('returns the code with its expiry and verification state', async () => {
    await expect(service.reveal(9, 31)).resolves.toEqual({
      code: '482913',
      expiresAt: CHALLENGE.expiresAt,
      verifiedAt: null,
    });
  });

  it('writes an OTP_CODE_REVEALED row attributed to the revealing admin', async () => {
    await service.reveal(9, 31);
    expect(m.profileAuditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 9,
        action: 'OTP_CODE_REVEALED',
        diff: { challengeId: 31, channel: 'PHONE', destination: '+91 98765 43210' },
      },
    });
  });

  // The one rule this endpoint exists to hold: reading the code is auditable,
  // and the audit itself never becomes a second copy of the secret.
  it('never puts the code in the audit diff', async () => {
    await service.reveal(9, 31);
    const args = m.profileAuditLog.create.mock.calls[0]?.[0] as {
      data: { diff: Record<string, unknown> };
    };
    expect(JSON.stringify(args.data.diff)).not.toContain('482913');
    expect(args.data.diff).not.toHaveProperty('code');
  });

  it('404s for an unknown challenge and audits nothing', async () => {
    m.otpChallenge.findUnique.mockResolvedValue(null);
    await expect(service.reveal(9, 999)).rejects.toBeInstanceOf(NotFoundException);
    expect(m.profileAuditLog.create).not.toHaveBeenCalled();
  });

  // The read and the audit write share one transaction, so a reveal can never
  // hand over digits while leaving no trace of who read them.
  it('reads and audits inside a single transaction', async () => {
    await service.reveal(9, 31);
    expect(m.$transaction).toHaveBeenCalledTimes(1);
  });
});
