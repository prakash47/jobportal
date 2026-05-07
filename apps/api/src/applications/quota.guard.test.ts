import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationQuotaGuard } from './quota.guard';

// Pins the contract that L1 delegates to preflight() and propagates whatever
// preflight throws. The interesting branch logic (allow / 429 / unlimited)
// lives in quota.service.test.ts; here we just verify the guard doesn't drop
// errors on the floor.

function makeContext(user: { sub: number } | undefined): unknown {
  const req = { user } as { user?: { sub: number } };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  };
}

describe('ApplicationQuotaGuard', () => {
  it('returns true and skips preflight when no user is on the request (JwtAuthGuard would already 401)', async () => {
    const preflight = vi.fn();
    const guard = new ApplicationQuotaGuard({ preflight } as never);
    const result = await guard.canActivate(makeContext(undefined) as never);
    expect(result).toBe(true);
    expect(preflight).not.toHaveBeenCalled();
  });

  it('calls preflight with the userId from req.user', async () => {
    const preflight = vi.fn().mockResolvedValue(undefined);
    const guard = new ApplicationQuotaGuard({ preflight } as never);
    const result = await guard.canActivate(makeContext({ sub: 42 }) as never);
    expect(result).toBe(true);
    expect(preflight).toHaveBeenCalledWith(42);
  });

  it('propagates preflight throws (e.g. 429)', async () => {
    const err = new HttpException({ message: 'limit' }, 429);
    const preflight = vi.fn().mockRejectedValue(err);
    const guard = new ApplicationQuotaGuard({ preflight } as never);
    await expect(guard.canActivate(makeContext({ sub: 42 }) as never)).rejects.toBe(err);
  });
});
