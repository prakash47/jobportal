import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';

// Process-level singleton wrapper around ioredis. Other services inject this
// rather than `new Redis()` themselves so we share one connection pool and
// close cleanly on shutdown. The @jobportal/feature-flags package keeps its
// own ioredis instance because it's deployable as a worker; the symmetry is
// intentional and the cost of the second connection is trivial.

@Injectable()
export class RedisService implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  private readonly redis: Redis;

  constructor() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.redis = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: false });
    this.redis.on('error', (err: Error) => {
      // Don't crash the API process on a transient Redis hiccup; downstream
      // callers degrade gracefully (read-fails return defaults, write-fails log).
      this.logger.warn(`redis error: ${err.message}`);
    });
  }

  client(): Redis {
    return this.redis;
  }

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      // Already disconnected — nothing to do.
    }
  }
}
