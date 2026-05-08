import { describe, expect, it, vi } from 'vitest';
import { handleRevalidate } from './revalidate-handler';

const noop = vi.fn();

describe('handleRevalidate', () => {
  it('returns 503 when REVALIDATE_SECRET is not set (misconfigured deploy)', async () => {
    const r = await handleRevalidate({
      authHeader: 'Bearer anything',
      body: { slug: 'hello' },
      secret: undefined,
      revalidatePath: noop,
    });
    expect(r.status).toBe(503);
    expect(r.body.revalidated).toBe(false);
  });

  it('returns 401 when the bearer token is missing or wrong', async () => {
    const r1 = await handleRevalidate({
      authHeader: null,
      body: { slug: 'hello' },
      secret: 'real',
      revalidatePath: noop,
    });
    expect(r1.status).toBe(401);

    const r2 = await handleRevalidate({
      authHeader: 'Bearer wrong',
      body: { slug: 'hello' },
      secret: 'real',
      revalidatePath: noop,
    });
    expect(r2.status).toBe(401);
  });

  it('returns 400 on missing slug', async () => {
    const r = await handleRevalidate({
      authHeader: 'Bearer real',
      body: {},
      secret: 'real',
      revalidatePath: noop,
    });
    expect(r.status).toBe(400);
  });

  it('returns 400 on a malformed slug (uppercase / spaces)', async () => {
    const r = await handleRevalidate({
      authHeader: 'Bearer real',
      body: { slug: 'Has Spaces' },
      secret: 'real',
      revalidatePath: noop,
    });
    expect(r.status).toBe(400);
  });

  it('happy path revalidates both index and detail paths', async () => {
    const calls: string[] = [];
    const r = await handleRevalidate({
      authHeader: 'Bearer real',
      body: { slug: 'how-to-write-a-resume' },
      secret: 'real',
      revalidatePath: (p: string) => {
        calls.push(p);
      },
    });
    expect(r.status).toBe(200);
    expect(r.body.revalidated).toBe(true);
    expect(calls).toEqual(['/career-advice', '/career-advice/how-to-write-a-resume']);
    expect(r.body.paths).toEqual(calls);
  });
});
