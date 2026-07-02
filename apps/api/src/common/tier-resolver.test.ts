import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    subscription: { findMany: vi.fn() },
    recruiter: { findUnique: vi.fn() },
  },
}));

import { prisma } from '@jobportal/db';
import { resolveRecruiterTier, resolveUserTier } from './tier-resolver';

const mocked = prisma as unknown as {
  subscription: { findMany: ReturnType<typeof vi.fn> };
  recruiter: { findUnique: ReturnType<typeof vi.fn> };
};

describe('resolveUserTier', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns FREE with no in-period subscriptions', async () => {
    mocked.subscription.findMany.mockResolvedValue([]);
    await expect(resolveUserTier(1)).resolves.toBe('FREE');
  });

  it('returns the highest tier across rows', async () => {
    mocked.subscription.findMany.mockResolvedValue([
      { plan: { tier: 'BASIC' } },
      { plan: { tier: 'ENTERPRISE' } },
      { plan: { tier: 'PREMIUM' } },
    ]);
    await expect(resolveUserTier(1)).resolves.toBe('ENTERPRISE');
  });
});

describe('resolveRecruiterTier', () => {
  beforeEach(() => vi.resetAllMocks());

  it('includes company-scoped subscriptions in the OR clause', async () => {
    mocked.recruiter.findUnique.mockResolvedValue({ companyId: 7 });
    mocked.subscription.findMany.mockResolvedValue([{ plan: { tier: 'PREMIUM' } }]);
    await expect(resolveRecruiterTier(42)).resolves.toBe('PREMIUM');
    const arg = mocked.subscription.findMany.mock.calls[0]?.[0] as {
      where: { OR: unknown[] };
    };
    expect(arg.where.OR).toEqual([{ userId: 42 }, { companyId: 7 }]);
  });

  it('falls back to plain user resolution when no Recruiter row exists', async () => {
    mocked.recruiter.findUnique.mockResolvedValue(null);
    mocked.subscription.findMany.mockResolvedValue([{ plan: { tier: 'BASIC' } }]);
    await expect(resolveRecruiterTier(42)).resolves.toBe('BASIC');
    const arg = mocked.subscription.findMany.mock.calls[0]?.[0] as {
      where: { userId?: number; OR?: unknown[] };
    };
    expect(arg.where.userId).toBe(42);
    expect(arg.where.OR).toBeUndefined();
  });

  it('returns FREE when neither the user nor the company holds a plan', async () => {
    mocked.recruiter.findUnique.mockResolvedValue({ companyId: 7 });
    mocked.subscription.findMany.mockResolvedValue([]);
    await expect(resolveRecruiterTier(42)).resolves.toBe('FREE');
  });
});
