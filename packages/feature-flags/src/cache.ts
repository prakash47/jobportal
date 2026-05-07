import Redis from 'ioredis';
import type { FeatureFlag } from './types';

const CACHE_TTL_SECONDS = 30;
const REDIS_KEY_PREFIX = 'flag:';
const INVALIDATE_CHANNEL = 'flag:invalidate';

// Process-level singletons. ioredis maintains its own connection pool per instance.
let redisClient: Redis | null = null;
let redisSubscriber: Redis | null = null;
const inMemoryCache = new Map<string, { flag: FeatureFlag | null; expiresAt: number }>();

function redisUrl(): string {
  return process.env.REDIS_URL ?? 'redis://localhost:6379';
}

function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(redisUrl(), { maxRetriesPerRequest: 3, lazyConnect: false });
    redisClient.on('error', (err: Error) => {
      // Degrade gracefully: log + continue. Evaluator will fall through to DB.
      console.warn('[feature-flags] redis client error:', err.message);
    });
  }
  return redisClient;
}

function ensureSubscriber(): void {
  if (redisSubscriber) return;
  redisSubscriber = new Redis(redisUrl());
  redisSubscriber.on('error', (err: Error) => {
    console.warn('[feature-flags] redis subscriber error:', err.message);
  });
  redisSubscriber.subscribe(INVALIDATE_CHANNEL).catch((err: unknown) => {
    console.warn('[feature-flags] subscribe failed:', err);
  });
  redisSubscriber.on('message', (channel: string, message: string) => {
    if (channel === INVALIDATE_CHANNEL) {
      inMemoryCache.delete(message);
    }
  });
}

// Date fields are strings after JSON.parse — restore them so consumers get
// real Date objects back (Prisma's typed FeatureFlag has Date columns).
function reviveFlag(raw: string): FeatureFlag {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return {
    ...parsed,
    createdAt: new Date(parsed['createdAt'] as string),
    updatedAt: new Date(parsed['updatedAt'] as string),
  } as unknown as FeatureFlag;
}

export async function readCachedFlag(key: string): Promise<FeatureFlag | null | undefined> {
  // Returns:
  //   FeatureFlag — cache hit, flag exists.
  //   null         — cache hit, flag is known to not exist (negative cache).
  //   undefined    — cache miss; caller should hit the DB.
  ensureSubscriber();

  const now = Date.now();
  const local = inMemoryCache.get(key);
  if (local && local.expiresAt > now) return local.flag;

  try {
    const raw = await getRedis().get(REDIS_KEY_PREFIX + key);
    if (raw === null) return undefined;
    const parsed = raw === 'null' ? null : reviveFlag(raw);
    inMemoryCache.set(key, { flag: parsed, expiresAt: now + CACHE_TTL_SECONDS * 1000 });
    return parsed;
  } catch (err) {
    console.warn('[feature-flags] redis read failed, falling through to DB:', err);
    return undefined;
  }
}

export async function writeCachedFlag(key: string, flag: FeatureFlag | null): Promise<void> {
  inMemoryCache.set(key, { flag, expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000 });
  try {
    await getRedis().set(
      REDIS_KEY_PREFIX + key,
      flag === null ? 'null' : JSON.stringify(flag),
      'EX',
      CACHE_TTL_SECONDS,
    );
  } catch (err) {
    console.warn('[feature-flags] redis write failed:', err);
  }
}

export async function invalidateFlag(key: string): Promise<void> {
  inMemoryCache.delete(key);
  try {
    await getRedis().del(REDIS_KEY_PREFIX + key);
    await getRedis().publish(INVALIDATE_CHANNEL, key);
  } catch (err) {
    console.warn('[feature-flags] redis invalidate failed:', err);
  }
}

export async function disconnectCache(): Promise<void> {
  if (redisClient) await redisClient.quit();
  if (redisSubscriber) await redisSubscriber.quit();
  redisClient = null;
  redisSubscriber = null;
  inMemoryCache.clear();
}
