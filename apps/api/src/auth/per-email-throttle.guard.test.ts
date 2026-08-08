import { HttpException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = {
  incr: vi.fn(),
  expire: vi.fn(),
  ttl: vi.fn(),
  on: vi.fn(),
};

vi.mock('ioredis', () => ({
  default: class {
    incr = store.incr;
    expire = store.expire;
    ttl = store.ttl;
    on = store.on;
  },
}));

import { PerEmailThrottleGuard } from './per-email-throttle.guard';

const guard = new PerEmailThrottleGuard();

function ctx(email: string | undefined) {
  const res = {
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
  };
  return {
    res,
    context: {
      switchToHttp: () => ({
        getRequest: () => ({ body: email === undefined ? {} : { email } }),
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  store.expire.mockResolvedValue(1);
  store.ttl.mockResolvedValue(3600);
});

describe('PerEmailThrottleGuard', () => {
  it('allows a request under the limit', async () => {
    store.incr.mockResolvedValue(3);
    const { context } = ctx('a@b.co');
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('blocks past 10 attempts', async () => {
    store.incr.mockResolvedValue(11);
    const { context } = ctx('a@b.co');
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(HttpException);
  });

  it('advertises the REAL remaining lockout, not a generic guess', async () => {
    // The window is an hour. A client told "60" would retry ~60 times across
    // it and re-trip the limiter every time.
    store.incr.mockResolvedValue(11);
    store.ttl.mockResolvedValue(2874);
    const { context, res } = ctx('a@b.co');
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(HttpException);
    expect(res.headers['Retry-After']).toBe('2874');
  });

  it('falls back to the full window rather than advertising a negative wait', async () => {
    // Redis returns -1 (no TTL) / -2 (key gone) on a race with expiry.
    store.incr.mockResolvedValue(11);
    store.ttl.mockResolvedValue(-2);
    const { context, res } = ctx('a@b.co');
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(HttpException);
    expect(res.headers['Retry-After']).toBe('3600');
  });

  it('sets the TTL only on the first attempt in a window', async () => {
    store.incr.mockResolvedValue(1);
    const { context } = ctx('a@b.co');
    await guard.canActivate(context);
    expect(store.expire).toHaveBeenCalledWith('auth:login:email:a@b.co', 3600);

    vi.clearAllMocks();
    store.incr.mockResolvedValue(2);
    await guard.canActivate(ctx('a@b.co').context);
    expect(store.expire).not.toHaveBeenCalled();
  });

  it('lowercases the email so casing cannot buy a fresh budget', async () => {
    store.incr.mockResolvedValue(1);
    await guard.canActivate(ctx('A.User@Example.COM').context);
    expect(store.incr).toHaveBeenCalledWith('auth:login:email:a.user@example.com');
  });

  it('skips entirely when the body carries no email', async () => {
    const { context } = ctx(undefined);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(store.incr).not.toHaveBeenCalled();
  });

  it('fails OPEN when Redis is unreachable — the per-IP throttle still applies', async () => {
    store.incr.mockRejectedValue(new Error('ECONNREFUSED'));
    const { context } = ctx('a@b.co');
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
