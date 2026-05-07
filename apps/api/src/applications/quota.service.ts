import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { prisma, type SubscriptionStatus, type SubscriptionTier } from '@jobportal/db';
import { RedisService } from '../redis/redis.service';

// SRS §4.11.16-17 — daily-application quota for free-tier users.
// Counter lives in Redis: key 'user:{id}:apps:{YYYY-MM-DD}', TTL 26h.
// Flag gate: feature.unlimited_applications (TIER_GATED). When the flag
// matches the caller's tier, the limit lifts.

const UNLIMITED_FLAG = 'feature.unlimited_applications';
const SUBSCRIPTION_FLAG = 'subscription.system.enabled';
const TTL_SECONDS = 26 * 60 * 60;
const DEFAULT_LIMIT = 10;

// Per CLAUDE.md §0 — Day 0 plans are seeded but not active. A user counts as
// "subscribed to PREMIUM" only if they hold a non-terminal Subscription row
// AND that row's plan tier is the result.
const NON_TERMINAL_STATUSES: SubscriptionStatus[] = ['ACTIVE', 'TRIALING', 'PAST_DUE'];

const TIER_RANK: Record<SubscriptionTier, number> = {
  FREE: 0,
  BASIC: 1,
  PREMIUM: 2,
  ENTERPRISE: 3,
};

export interface QuotaState {
  count: number;
  limit: number;
  unlimited: boolean;
  upgradeAvailable: boolean;
}

export interface QuotaError extends QuotaState {
  message: string;
}

@Injectable()
export class ApplicationQuotaService {
  private readonly logger = new Logger(ApplicationQuotaService.name);

  constructor(private readonly redis: RedisService) {}

  getDailyLimit(): number {
    const env = process.env.FREE_TIER_DAILY_APPLY_LIMIT;
    if (!env) return DEFAULT_LIMIT;
    const n = Number(env);
    if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
    return Math.floor(n);
  }

  // UTC date so the same key works across IST/UTC processes; per-user IST
  // midnight is queued as a follow-up chip.
  keyForToday(userId: number, now: Date = new Date()): string {
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    return `user:${userId}:apps:${yyyy}-${mm}-${dd}`;
  }

  // Resolves the user's effective tier. Multiple non-terminal subscriptions
  // (shouldn't happen, but defensive) → take the highest-ranked tier.
  async getUserTier(userId: number): Promise<SubscriptionTier> {
    const subs = await prisma.subscription.findMany({
      where: {
        userId,
        status: { in: NON_TERMINAL_STATUSES },
        currentPeriodEnd: { gt: new Date() },
      },
      select: { plan: { select: { tier: true } } },
    });
    if (subs.length === 0) return 'FREE';
    let best: SubscriptionTier = 'FREE';
    for (const s of subs) {
      if (TIER_RANK[s.plan.tier] > TIER_RANK[best]) best = s.plan.tier;
    }
    return best;
  }

  async getCurrentCount(userId: number): Promise<number> {
    try {
      const raw = await this.redis.client().get(this.keyForToday(userId));
      if (!raw) return 0;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    } catch (err) {
      // Redis hiccup → degrade to 0 (best-case for the user). The L1+L3
      // pattern means a single missed read just lets one extra apply through;
      // the limit re-engages on the next request.
      this.logger.warn(`getCurrentCount fell back to 0 for ${userId}: ${(err as Error).message}`);
      return 0;
    }
  }

  // Read-only state used by both the L1 guard preflight and the
  // /me/applications/quota endpoint that the web layer reads server-side.
  async readState(userId: number): Promise<QuotaState> {
    const tier = await this.getUserTier(userId);
    const unlimited = await isFlagEnabled(UNLIMITED_FLAG, { userId, tier });
    const upgradeAvailable = await isFlagEnabled(SUBSCRIPTION_FLAG);
    if (unlimited) {
      return { count: 0, limit: this.getDailyLimit(), unlimited: true, upgradeAvailable };
    }
    const count = await this.getCurrentCount(userId);
    return { count, limit: this.getDailyLimit(), unlimited: false, upgradeAvailable };
  }

  // Layer 1 — fast preflight check before the controller touches Postgres.
  // Read-only; the actual increment lives in consumeOrThrow.
  async preflight(userId: number): Promise<void> {
    const state = await this.readState(userId);
    if (state.unlimited) return;
    if (state.count >= state.limit) {
      throw this.over(state);
    }
  }

  // Layer 3 — atomic check + increment. Called from inside ApplicationsService
  // AFTER prisma.application.create succeeds, so a duplicate-apply (P2002)
  // does not cost a slot.
  async consume(userId: number): Promise<QuotaState> {
    const tier = await this.getUserTier(userId);
    const unlimited = await isFlagEnabled(UNLIMITED_FLAG, { userId, tier });
    const upgradeAvailable = await isFlagEnabled(SUBSCRIPTION_FLAG);
    if (unlimited) {
      return { count: 0, limit: this.getDailyLimit(), unlimited: true, upgradeAvailable };
    }

    const limit = this.getDailyLimit();
    const key = this.keyForToday(userId);
    const next = await this.redis.client().incr(key);
    if (next === 1) {
      await this.redis.client().expire(key, TTL_SECONDS);
    }
    if (next > limit) {
      // Race revert: another caller incremented past the limit between our
      // preflight and this consume. Decrement and surface the friendly 429.
      await this.redis.client().decr(key);
      throw this.over({ count: limit, limit, unlimited: false, upgradeAvailable });
    }
    return { count: next, limit, unlimited: false, upgradeAvailable };
  }

  private over(state: QuotaState): HttpException {
    const body: QuotaError = {
      ...state,
      count: state.limit,
      message:
        'Daily application limit reached. ' +
        (state.upgradeAvailable
          ? 'Upgrade your plan to apply to more jobs today.'
          : 'You can apply again tomorrow.'),
    };
    return new HttpException(body, HttpStatus.TOO_MANY_REQUESTS);
  }
}
