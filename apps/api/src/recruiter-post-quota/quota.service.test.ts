import { HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/feature-flags', () => ({ isFlagEnabled: vi.fn() }));
vi.mock('@jobportal/db', () => ({
  // recruiter.findUnique backs resolveRecruiterTier (company-scoped billing);
  // null → falls back to the plain user-tier path these tests exercise.
  prisma: { subscription: { findMany: vi.fn() }, recruiter: { findUnique: vi.fn() } },
}));

import { isFlagEnabled } from '@jobportal/feature-flags';
import { prisma } from '@jobportal/db';
import { RecruiterPostQuotaService } from './quota.service';

const mockedFlag = isFlagEnabled as ReturnType<typeof vi.fn>;
const mockedPrisma = prisma as unknown as {
  subscription: { findMany: ReturnType<typeof vi.fn> };
  recruiter: { findUnique: ReturnType<typeof vi.fn> };
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
      del: vi.fn(async (key: string) => {
        const had = store.delete(key);
        delete expires[key];
        return had ? 1 : 0;
      }),
    }),
  };
}

describe('RecruiterPostQuotaService key formatting', () => {
  it('keyDaily uses YYYY-MM-DD UTC', () => {
    const svc = new RecruiterPostQuotaService(makeRedisStub() as never);
    expect(svc.keyDaily(42, new Date('2026-05-08T12:00:00Z'))).toBe(
      'recruiter:42:posts:daily:2026-05-08',
    );
  });

  it('keyMonthly uses YYYY-MM UTC', () => {
    const svc = new RecruiterPostQuotaService(makeRedisStub() as never);
    expect(svc.keyMonthly(42, new Date('2026-05-08T12:00:00Z'))).toBe(
      'recruiter:42:posts:monthly:2026-05',
    );
  });
});

describe('RecruiterPostQuotaService limits', () => {
  it('returns env override when set', () => {
    process.env['RECRUITER_DAILY_POST_LIMIT'] = '7';
    process.env['RECRUITER_MONTHLY_POST_LIMIT'] = '50';
    const svc = new RecruiterPostQuotaService(makeRedisStub() as never);
    expect(svc.getDailyLimit()).toBe(7);
    expect(svc.getMonthlyLimit()).toBe(50);
    delete process.env['RECRUITER_DAILY_POST_LIMIT'];
    delete process.env['RECRUITER_MONTHLY_POST_LIMIT'];
  });

  it('falls back to defaults on missing/malformed env', () => {
    delete process.env['RECRUITER_DAILY_POST_LIMIT'];
    delete process.env['RECRUITER_MONTHLY_POST_LIMIT'];
    const svc = new RecruiterPostQuotaService(makeRedisStub() as never);
    expect(svc.getDailyLimit()).toBe(5);
    expect(svc.getMonthlyLimit()).toBe(30);
    process.env['RECRUITER_DAILY_POST_LIMIT'] = 'abc';
    expect(new RecruiterPostQuotaService(makeRedisStub() as never).getDailyLimit()).toBe(5);
    delete process.env['RECRUITER_DAILY_POST_LIMIT'];
  });
});

describe('RecruiterPostQuotaService.preflight + consume', () => {
  let svc: RecruiterPostQuotaService;
  let redis: ReturnType<typeof makeRedisStub>;

  beforeEach(() => {
    vi.resetAllMocks();
    redis = makeRedisStub();
    svc = new RecruiterPostQuotaService(redis as never);
    mockedPrisma.subscription.findMany.mockResolvedValue([]);
    mockedPrisma.recruiter.findUnique.mockResolvedValue(null);
  });

  it('preflight allows under both limits', async () => {
    mockedFlag.mockResolvedValueOnce(false); // unlimited
    mockedFlag.mockResolvedValueOnce(false); // subscription
    redis.store.set(svc.keyDaily(42), 2);
    redis.store.set(svc.keyMonthly(42), 10);
    await expect(svc.preflight(42)).resolves.toBeUndefined();
  });

  it('preflight throws 429 with window=daily when daily is exhausted', async () => {
    mockedFlag.mockResolvedValueOnce(false);
    mockedFlag.mockResolvedValueOnce(false);
    redis.store.set(svc.keyDaily(42), 5);
    redis.store.set(svc.keyMonthly(42), 10);
    try {
      await svc.preflight(42);
    } catch (e) {
      const body = (e as HttpException).getResponse() as { window: string };
      expect(body.window).toBe('daily');
      return;
    }
    throw new Error('expected throw');
  });

  it('preflight throws 429 with window=monthly when only monthly is exhausted', async () => {
    mockedFlag.mockResolvedValueOnce(false);
    mockedFlag.mockResolvedValueOnce(false);
    redis.store.set(svc.keyDaily(42), 2);
    redis.store.set(svc.keyMonthly(42), 30);
    try {
      await svc.preflight(42);
    } catch (e) {
      const body = (e as HttpException).getResponse() as { window: string };
      expect(body.window).toBe('monthly');
      return;
    }
    throw new Error('expected throw');
  });

  it('preflight short-circuits when the unlimited flag is ON', async () => {
    mockedFlag.mockResolvedValueOnce(true); // unlimited
    mockedFlag.mockResolvedValueOnce(false);
    redis.store.set(svc.keyDaily(42), 999);
    redis.store.set(svc.keyMonthly(42), 999);
    await expect(svc.preflight(42)).resolves.toBeUndefined();
  });

  it('consume increments both windows + sets EXPIRE on first', async () => {
    mockedFlag.mockResolvedValueOnce(false);
    mockedFlag.mockResolvedValueOnce(false);
    const out = await svc.consume(42);
    expect(out.daily.count).toBe(1);
    expect(out.monthly.count).toBe(1);
    expect(redis.expires[svc.keyDaily(42)]).toBe(26 * 60 * 60);
    expect(redis.expires[svc.keyMonthly(42)]).toBe(32 * 24 * 60 * 60);
  });

  it('consume reverts both keys when daily race overflows', async () => {
    redis.store.set(svc.keyDaily(42), 5); // already at limit
    redis.store.set(svc.keyMonthly(42), 10);
    mockedFlag.mockResolvedValueOnce(false);
    mockedFlag.mockResolvedValueOnce(false);
    await expect(svc.consume(42)).rejects.toBeInstanceOf(HttpException);
    expect(redis.store.get(svc.keyDaily(42))).toBe(5);
    expect(redis.store.get(svc.keyMonthly(42))).toBe(10);
  });

  it('consume reverts both keys when monthly race overflows', async () => {
    redis.store.set(svc.keyDaily(42), 2);
    redis.store.set(svc.keyMonthly(42), 30);
    mockedFlag.mockResolvedValueOnce(false);
    mockedFlag.mockResolvedValueOnce(false);
    await expect(svc.consume(42)).rejects.toBeInstanceOf(HttpException);
    expect(redis.store.get(svc.keyDaily(42))).toBe(2);
    expect(redis.store.get(svc.keyMonthly(42))).toBe(30);
  });

  it('consume short-circuits when unlimited (no Redis touch)', async () => {
    mockedFlag.mockResolvedValueOnce(true);
    mockedFlag.mockResolvedValueOnce(false);
    const out = await svc.consume(42);
    expect(out.unlimited).toBe(true);
    expect(redis.store.get(svc.keyDaily(42))).toBeUndefined();
    expect(redis.store.get(svc.keyMonthly(42))).toBeUndefined();
  });

  it('429 body carries upgradeAvailable=true when subscription system is enabled', async () => {
    redis.store.set(svc.keyDaily(42), 5);
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

describe('RecruiterPostQuotaService refund', () => {
  it('gives the slot back on both windows', async () => {
    const redis = makeRedisStub();
    const svc = new RecruiterPostQuotaService(redis as never);
    redis.store.set(svc.keyDaily(42), 3);
    redis.store.set(svc.keyMonthly(42), 9);

    await svc.refund(42);

    expect(redis.store.get(svc.keyDaily(42))).toBe(2);
    expect(redis.store.get(svc.keyMonthly(42))).toBe(8);
  });

  // Redis DECR on a MISSING key creates it at -1 with no TTL, and only consume()
  // ever sets an expiry — so the counter would sit negative indefinitely and
  // silently grant an extra post. This was near-unreachable while refunds only
  // fired on a lost publish race, but admin moderation makes them routine: a job
  // submitted on Monday and rejected on Wednesday has a daily key that expired
  // long before the decision.
  it('never leaves a counter negative when the window has already rolled over', async () => {
    const redis = makeRedisStub();
    const svc = new RecruiterPostQuotaService(redis as never);

    await svc.refund(42);

    expect(redis.store.has(svc.keyDaily(42))).toBe(false);
    expect(redis.store.has(svc.keyMonthly(42))).toBe(false);
  });

  it('deletes rather than clamps, so the next consume() recreates the key with a TTL', async () => {
    const redis = makeRedisStub();
    const svc = new RecruiterPostQuotaService(redis as never);
    redis.store.set(svc.keyDaily(42), 0);

    await svc.refund(42);

    // A key left at 0 with no expiry would never roll over on its own.
    expect(redis.store.has(svc.keyDaily(42))).toBe(false);
  });
});
