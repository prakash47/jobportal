import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

// Per SRS §4.12.7 second branch: 10 failed login attempts per hour per email.
const WINDOW_SECONDS = 3600;
const MAX_ATTEMPTS = 10;

let client: Redis | null = null;
function redis(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
    client.on('error', (e: Error) => {
      console.warn('[per-email-throttle] redis error:', e.message);
    });
  }
  return client;
}

@Injectable()
export class PerEmailThrottleGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ body?: { email?: string } }>();
    const email = (req.body?.email ?? '').toLowerCase();
    if (!email) return true;

    const key = `auth:login:email:${email}`;
    try {
      const count = await redis().incr(key);
      if (count === 1) await redis().expire(key, WINDOW_SECONDS);
      if (count > MAX_ATTEMPTS) {
        throw new HttpException(
          'Too many login attempts for this email — try again later',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // Redis unreachable — fail open. Per-IP throttle still applies.
      console.warn('[per-email-throttle] redis incr failed; failing open:', err);
    }
    return true;
  }
}
