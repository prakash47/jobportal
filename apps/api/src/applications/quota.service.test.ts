import { HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/feature-flags', () => ({
  isFlagEnabled: vi.fn(),
}));

vi.mock('@jobportal/db', () => ({
  prisma: {
    subscription: { findMany: vi.fn() },
  },
}));

import { isFlagEnabled } from '@jobportal/feature-flags';
import { prisma } from '@jobportal/db';
import { ApplicationQuotaService } from './quota.service';

const mockedFlag = isFlagEnabled as ReturnType<typeof vi.fn>;
const mockedPrisma = prisma as unknown as {
  subscription: { findMany: ReturnType<typeof vi.fn> };
};

function makeRedisStub() {
  const store = new Map<string, number>();
  const expires: Record<string, number> = {};
  return {
    store,
    expires,
    client: () => ({
      get: vi.fn(async (key: string) => {
        const v = store.get(key);
        return v === undefined ? null : String(v);
      }),
      incr: vi.fn(async (key: string) => {
        const v = (store.get(key) ?? 0) + 1;
        store.set(key, v);
        return v;
      }),
      decr: vi.fn(async (key: string) => {
        const v = (store.get(key) ?? 0) - 1;
        store.set(key, v);
        return v;
      }),
      expire: vi.fn(async (key: string, ttl: number) => {
        expires[key] = ttl;
        return 1;
      }),
    }),
  };
}

describe('ApplicationQuotaService.keyForToday', () => {
  let svc: ApplicationQuotaService;
  beforeEach(() => {
    svc = new ApplicationQuotaService(makeRedisStub() as never);
  });

  it('formats UTC date YYYY-MM-DD', () => {
    const k = svc.keyForToday(42, new Date('2026-05-08T12:00:00Z'));
    expect(k).toBe('user:42:apps:2026-05-08');
  });

  it('zero-pads single-digit month/day', () => {
    expect(svc.keyForToday(1, new Date('2026-01-05T00:00:00Z'))).toBe('user:1:apps:2026-01-05');
  });

  it('handles UTC boundary correctly (just before midnight UTC)', () => {
    expect(svc.keyForToday(1, new Date('2026-05-08T23:59:00Z'))).toBe('user:1:apps:2026-05-08');
  });
});

describe('ApplicationQuotaService.getDailyLimit', () => {
  it('returns 10 by default', () => {
    delete process.env['FREE_TIER_DAILY_APPLY_LIMIT'];
    const svc = new ApplicationQuotaService(makeRedisStub() as never);
    expect(svc.getDailyLimit()).toBe(10);
  });

  it('respects the env override', () => {
    process.env['FREE_TIER_DAILY_APPLY_LIMIT'] = '25';
    const svc = new ApplicationQuotaService(makeRedisStub() as never);
    expect(svc.getDailyLimit()).toBe(25);
    delete process.env['FREE_TIER_DAILY_APPLY_LIMIT'];
  });

  it('falls back to 10 on a malformed env value', () => {
    process.env['FREE_TIER_DAILY_APPLY_LIMIT'] = 'abc';
    const svc = new ApplicationQuotaService(makeRedisStub() as never);
    expect(svc.getDailyLimit()).toBe(10);
    delete process.env['FREE_TIER_DAILY_APPLY_LIMIT'];
  });
});

describe('ApplicationQuotaService.getUserTier', () => {
  let svc: ApplicationQuotaService;
  beforeEach(() => {
    vi.resetAllMocks();
    svc = new ApplicationQuotaService(makeRedisStub() as never);
  });

  it('returns FREE when the user has no subscription', async () => {
    mockedPrisma.subscription.findMany.mockResolvedValue([]);
    expect(await svc.getUserTier(42)).toBe('FREE');
  });

  it('returns the active subscription tier', async () => {
    mockedPrisma.subscription.findMany.mockResolvedValue([{ plan: { tier: 'PREMIUM' } }]);
    expect(await svc.getUserTier(42)).toBe('PREMIUM');
  });

  it('picks the highest tier when multiple non-terminal subscriptions exist', async () => {
    mockedPrisma.subscription.findMany.mockResolvedValue([
      { plan: { tier: 'BASIC' } },
      { plan: { tier: 'ENTERPRISE' } },
      { plan: { tier: 'PREMIUM' } },
    ]);
    expect(await svc.getUserTier(42)).toBe('ENTERPRISE');
  });
});

describe('ApplicationQuotaService.preflight + consume', () => {
  let svc: ApplicationQuotaService;
  let redis: ReturnType<typeof makeRedisStub>;

  beforeEach(() => {
    vi.resetAllMocks();
    redis = makeRedisStub();
    svc = new ApplicationQuotaService(redis as never);
    mockedPrisma.subscription.findMany.mockResolvedValue([]);
  });

  it('preflight allows under the limit', async () => {
    mockedFlag.mockResolvedValueOnce(false); // unlimited flag
    mockedFlag.mockResolvedValueOnce(false); // subscription system
    redis.store.set(svc.keyForToday(42), 5);
    await expect(svc.preflight(42)).resolves.toBeUndefined();
  });

  it('preflight throws 429 when at the limit', async () => {
    mockedFlag.mockResolvedValueOnce(false); // unlimited
    mockedFlag.mockResolvedValueOnce(false); // subscription
    redis.store.set(svc.keyForToday(42), 10);
    await expect(svc.preflight(42)).rejects.toBeInstanceOf(HttpException);
  });

  it('preflight short-circuits when the unlimited flag is ON for the tier', async () => {
    mockedFlag.mockResolvedValueOnce(true); // unlimited
    mockedFlag.mockResolvedValueOnce(false);
    // Even with count > limit, unlimited wins.
    redis.store.set(svc.keyForToday(42), 999);
    await expect(svc.preflight(42)).resolves.toBeUndefined();
  });

  it('consume increments and returns the new count', async () => {
    mockedFlag.mockResolvedValueOnce(false); // unlimited
    mockedFlag.mockResolvedValueOnce(false); // subscription
    const out = await svc.consume(42);
    expect(out.count).toBe(1);
    expect(out.unlimited).toBe(false);
    expect(redis.expires[svc.keyForToday(42)]).toBe(26 * 60 * 60);
  });

  it('consume sets EXPIRE only on the first increment', async () => {
    redis.store.set(svc.keyForToday(42), 3);
    mockedFlag.mockResolvedValueOnce(false);
    mockedFlag.mockResolvedValueOnce(false);
    await svc.consume(42);
    expect(redis.expires[svc.keyForToday(42)]).toBeUndefined();
  });

  it('consume reverts via DECR when the increment would exceed the limit', async () => {
    redis.store.set(svc.keyForToday(42), 10); // already at limit
    mockedFlag.mockResolvedValueOnce(false);
    mockedFlag.mockResolvedValueOnce(false);
    await expect(svc.consume(42)).rejects.toBeInstanceOf(HttpException);
    // INCR pushed to 11, DECR brought back to 10.
    expect(redis.store.get(svc.keyForToday(42))).toBe(10);
  });

  it('consume short-circuits without touching Redis when unlimited', async () => {
    mockedFlag.mockResolvedValueOnce(true); // unlimited
    mockedFlag.mockResolvedValueOnce(false);
    const out = await svc.consume(42);
    expect(out.unlimited).toBe(true);
    expect(redis.store.get(svc.keyForToday(42))).toBeUndefined();
  });

  it('429 body carries upgradeAvailable=false on Day 0', async () => {
    redis.store.set(svc.keyForToday(42), 10);
    mockedFlag.mockResolvedValueOnce(false); // unlimited
    mockedFlag.mockResolvedValueOnce(false); // subscription system OFF
    try {
      await svc.preflight(42);
    } catch (e) {
      const body = (e as HttpException).getResponse() as { upgradeAvailable: boolean };
      expect(body.upgradeAvailable).toBe(false);
      return;
    }
    throw new Error('expected throw');
  });

  it('429 body carries upgradeAvailable=true when subscription system is enabled', async () => {
    redis.store.set(svc.keyForToday(42), 10);
    mockedFlag.mockResolvedValueOnce(false); // unlimited
    mockedFlag.mockResolvedValueOnce(true); // subscription system ON
    try {
      await svc.preflight(42);
    } catch (e) {
      const body = (e as HttpException).getResponse() as { upgradeAvailable: boolean; message: string };
      expect(body.upgradeAvailable).toBe(true);
      expect(body.message).toContain('Upgrade');
      return;
    }
    throw new Error('expected throw');
  });
});
