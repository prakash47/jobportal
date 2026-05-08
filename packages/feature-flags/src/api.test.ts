import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    featureFlag: { findUnique: vi.fn() },
    flagAuditLog: { findMany: vi.fn(), count: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

import { prisma } from '@jobportal/db';
import { listAuditLog } from './api';

const mocked = prisma as unknown as {
  featureFlag: { findUnique: ReturnType<typeof vi.fn> };
  flagAuditLog: {
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  user: { findMany: ReturnType<typeof vi.fn> };
};

describe('listAuditLog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns paginated rows joined with flag + admin user', async () => {
    mocked.flagAuditLog.findMany.mockResolvedValue([
      {
        id: 10,
        flagId: 5,
        changedAt: new Date('2026-05-08T10:00:00Z'),
        changedById: 1,
        reason: 'launch test',
        before: { enabled: false },
        after: { enabled: true },
        flag: { key: 'services.menu.visible', uiLabel: 'Show Services link' },
      },
    ]);
    mocked.flagAuditLog.count.mockResolvedValue(1);
    mocked.user.findMany.mockResolvedValue([
      { id: 1, name: 'Admin', email: 'admin@example.com' },
    ]);

    const out = await listAuditLog({});
    expect(out.total).toBe(1);
    expect(out.page).toBe(1);
    expect(out.pageSize).toBe(25);
    expect(out.hits).toHaveLength(1);
    expect(out.hits[0]).toMatchObject({
      flagKey: 'services.menu.visible',
      flagUiLabel: 'Show Services link',
      reason: 'launch test',
      changedBy: { id: 1, name: 'Admin', email: 'admin@example.com' },
    });
  });

  it('orphan changedById returns null changedBy (no failure)', async () => {
    mocked.flagAuditLog.findMany.mockResolvedValue([
      {
        id: 11,
        flagId: 5,
        changedAt: new Date(),
        changedById: 999,
        reason: null,
        before: {},
        after: { enabled: true },
        flag: { key: 'a', uiLabel: null },
      },
    ]);
    mocked.flagAuditLog.count.mockResolvedValue(1);
    mocked.user.findMany.mockResolvedValue([]); // user 999 was deleted

    const out = await listAuditLog({});
    expect(out.hits[0]?.changedBy).toBeNull();
  });

  it('changedById null (system change) returns null changedBy without user query', async () => {
    mocked.flagAuditLog.findMany.mockResolvedValue([
      {
        id: 12,
        flagId: 5,
        changedAt: new Date(),
        changedById: null,
        reason: null,
        before: {},
        after: { enabled: true },
        flag: { key: 'a', uiLabel: null },
      },
    ]);
    mocked.flagAuditLog.count.mockResolvedValue(1);

    const out = await listAuditLog({});
    expect(out.hits[0]?.changedBy).toBeNull();
    // No user IDs to look up — query should not run.
    expect(mocked.user.findMany).not.toHaveBeenCalled();
  });

  it('flagKey filter resolves to flagId equality', async () => {
    mocked.featureFlag.findUnique.mockResolvedValue({ id: 5 });
    mocked.flagAuditLog.findMany.mockResolvedValue([]);
    mocked.flagAuditLog.count.mockResolvedValue(0);

    await listAuditLog({ flagKey: 'services.menu.visible' });
    const args = mocked.flagAuditLog.findMany.mock.calls[0]?.[0] as {
      where: { flagId: number };
    };
    expect(args.where).toEqual({ flagId: 5 });
  });

  it('unknown flagKey returns empty result rather than throwing', async () => {
    mocked.featureFlag.findUnique.mockResolvedValue(null);
    const out = await listAuditLog({ flagKey: 'bogus.key' });
    expect(out).toEqual({ hits: [], total: 0, page: 1, pageSize: 25 });
    expect(mocked.flagAuditLog.findMany).not.toHaveBeenCalled();
  });

  it('page=3 → skip 50, take 25', async () => {
    mocked.flagAuditLog.findMany.mockResolvedValue([]);
    mocked.flagAuditLog.count.mockResolvedValue(0);
    await listAuditLog({ page: 3 });
    const args = mocked.flagAuditLog.findMany.mock.calls[0]?.[0] as {
      skip: number;
      take: number;
    };
    expect(args.skip).toBe(50);
    expect(args.take).toBe(25);
  });
});
