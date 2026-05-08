import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { resolveUserTier } from '../common/tier-resolver';
import { RedisService } from '../redis/redis.service';

// SRS §4.9.7 — recruiter post quota. Two windows enforced together: daily
// and monthly. Counters live in Redis with appropriate TTLs. The flag
// feature.recruiter_post_quota (TIER_GATED) lifts both limits when ON for
// the recruiter's tier.

const UNLIMITED_FLAG = 'feature.recruiter_post_quota';
const SUBSCRIPTION_FLAG = 'subscription.system.enabled';

const DAILY_TTL_SECONDS = 26 * 60 * 60; // 26h — same shape as the apply quota
const MONTHLY_TTL_SECONDS = 32 * 24 * 60 * 60; // 32 days — covers any month

const DAILY_DEFAULT = 5;
const MONTHLY_DEFAULT = 30;

export interface RecruiterQuotaWindow {
  count: number;
  limit: number;
}

export interface RecruiterQuotaState {
  daily: RecruiterQuotaWindow;
  monthly: RecruiterQuotaWindow;
  unlimited: boolean;
  upgradeAvailable: boolean;
}

@Injectable()
export class RecruiterPostQuotaService {
  private readonly logger = new Logger(RecruiterPostQuotaService.name);

  constructor(private readonly redis: RedisService) {}

  getDailyLimit(): number {
    return readEnvInt('RECRUITER_DAILY_POST_LIMIT', DAILY_DEFAULT);
  }

  getMonthlyLimit(): number {
    return readEnvInt('RECRUITER_MONTHLY_POST_LIMIT', MONTHLY_DEFAULT);
  }

  // UTC date keys so the same value works across processes regardless of
  // server TZ; per-user IST midnight remains the same chip we queued for
  // the apply-quota service.
  keyDaily(userId: number, now: Date = new Date()): string {
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    return `recruiter:${userId}:posts:daily:${yyyy}-${mm}-${dd}`;
  }

  keyMonthly(userId: number, now: Date = new Date()): string {
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `recruiter:${userId}:posts:monthly:${yyyy}-${mm}`;
  }

  private async readCount(key: string): Promise<number> {
    try {
      const raw = await this.redis.client().get(key);
      if (!raw) return 0;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    } catch (err) {
      this.logger.warn(`recruiter quota read fell back to 0 (${key}): ${(err as Error).message}`);
      return 0;
    }
  }

  // Read-only state for the wizard's L2 UI hint and the L1 preflight guard.
  async readState(userId: number): Promise<RecruiterQuotaState> {
    const tier = await resolveUserTier(userId);
    const unlimited = await isFlagEnabled(UNLIMITED_FLAG, { userId, tier });
    const upgradeAvailable = await isFlagEnabled(SUBSCRIPTION_FLAG);
    if (unlimited) {
      return {
        daily: { count: 0, limit: this.getDailyLimit() },
        monthly: { count: 0, limit: this.getMonthlyLimit() },
        unlimited: true,
        upgradeAvailable,
      };
    }
    const [daily, monthly] = await Promise.all([
      this.readCount(this.keyDaily(userId)),
      this.readCount(this.keyMonthly(userId)),
    ]);
    return {
      daily: { count: daily, limit: this.getDailyLimit() },
      monthly: { count: monthly, limit: this.getMonthlyLimit() },
      unlimited: false,
      upgradeAvailable,
    };
  }

  // Layer 1 — fast preflight check. Read-only; the actual increment lives
  // in consume(). Throws 429 with the load-bearing window noted in the
  // body so the wizard can render a precise message.
  async preflight(userId: number): Promise<void> {
    const state = await this.readState(userId);
    if (state.unlimited) return;
    if (state.daily.count >= state.daily.limit) throw this.over(state, 'daily');
    if (state.monthly.count >= state.monthly.limit) throw this.over(state, 'monthly');
  }

  // Refund — DECR both keys. Caller uses this when the post-consume work
  // (e.g. the Prisma transaction) fails so the recruiter does not permanently
  // lose a slot. Best-effort: a Redis blip just leaves a slot consumed and
  // the natural TTL roll-over reconciles within 26h.
  async refund(userId: number): Promise<void> {
    try {
      await this.redis.client().decr(this.keyDaily(userId));
      await this.redis.client().decr(this.keyMonthly(userId));
    } catch (err) {
      this.logger.warn(`refund() failed for user ${userId}: ${(err as Error).message}`);
    }
  }

  // Layer 3 — atomic. INCR both keys; if either now exceeds the limit, DECR
  // both back and throw 429. EXPIRE-on-first ensures stale keys roll over.
  async consume(userId: number): Promise<RecruiterQuotaState> {
    const tier = await resolveUserTier(userId);
    const unlimited = await isFlagEnabled(UNLIMITED_FLAG, { userId, tier });
    const upgradeAvailable = await isFlagEnabled(SUBSCRIPTION_FLAG);
    if (unlimited) {
      return {
        daily: { count: 0, limit: this.getDailyLimit() },
        monthly: { count: 0, limit: this.getMonthlyLimit() },
        unlimited: true,
        upgradeAvailable,
      };
    }

    const dailyKey = this.keyDaily(userId);
    const monthlyKey = this.keyMonthly(userId);
    const dailyLimit = this.getDailyLimit();
    const monthlyLimit = this.getMonthlyLimit();

    const dailyNext = await this.redis.client().incr(dailyKey);
    if (dailyNext === 1) await this.redis.client().expire(dailyKey, DAILY_TTL_SECONDS);
    const monthlyNext = await this.redis.client().incr(monthlyKey);
    if (monthlyNext === 1) await this.redis.client().expire(monthlyKey, MONTHLY_TTL_SECONDS);

    if (dailyNext > dailyLimit || monthlyNext > monthlyLimit) {
      // Race revert: another caller pushed past the limit between our
      // preflight and this consume. DECR both regardless of which window
      // overflowed — keeps the counters consistent with what the user
      // actually committed.
      await this.redis.client().decr(dailyKey);
      await this.redis.client().decr(monthlyKey);
      throw this.over(
        {
          daily: { count: dailyLimit, limit: dailyLimit },
          monthly: { count: monthlyLimit, limit: monthlyLimit },
          unlimited: false,
          upgradeAvailable,
        },
        dailyNext > dailyLimit ? 'daily' : 'monthly',
      );
    }

    return {
      daily: { count: dailyNext, limit: dailyLimit },
      monthly: { count: monthlyNext, limit: monthlyLimit },
      unlimited: false,
      upgradeAvailable,
    };
  }

  private over(state: RecruiterQuotaState, which: 'daily' | 'monthly'): HttpException {
    const friendly =
      which === 'daily'
        ? 'Daily post limit reached.'
        : 'Monthly post limit reached.';
    const body = {
      ...state,
      message:
        friendly +
        ' ' +
        (state.upgradeAvailable
          ? 'Upgrade your plan to post more jobs.'
          : 'You can post again ' + (which === 'daily' ? 'tomorrow' : 'next month') + '.'),
      window: which,
    };
    return new HttpException(body, HttpStatus.TOO_MANY_REQUESTS);
  }
}

function readEnvInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}
