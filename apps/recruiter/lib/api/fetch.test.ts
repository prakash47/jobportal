import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Tests for the 401 → refresh → retry helper.
//
// The single-flight assertion is the one that matters most. Refresh tokens
// rotate on every use (CLAUDE.md §9), so if two simultaneous 401s each triggered
// their own refresh, the second would present a token the first had already
// rotated away — and the mechanism meant to keep a user signed in would be what
// signs them out. That is a race, so it cannot be caught by clicking around.

const API = 'http://localhost:4000';

function res(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let apiFetch: typeof import('./fetch').apiFetch;

beforeEach(async () => {
  vi.resetModules();
  // Fresh import per test so the module-level in-flight promise starts null.
  ({ apiFetch } = await import('./fetch'));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch — the happy path is untouched', () => {
  it('returns a 2xx directly and never calls refresh', async () => {
    // Typed parameters, not `async () =>`: without them the mock's call
    // tuple is `[]` and indexing it fails under noUncheckedIndexedAccess.
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => res(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const r = await apiFetch('/me/applications', { method: 'POST' });

    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${API}/me/applications`);
  });

  it('always sends cookies, because the API authenticates by cookie', async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => res(200));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/me/saved-jobs/1', { method: 'DELETE' });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.credentials).toBe('include');
    expect(init?.method).toBe('DELETE');
  });

  it('does not treat other failures as an expired session', async () => {
    // A 429 (quota) or 500 must reach the caller untouched — refreshing would
    // hide a real error behind an unrelated retry.
    for (const status of [400, 403, 404, 429, 500]) {
      const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => res(status));
      vi.stubGlobal('fetch', fetchMock);
      const r = await apiFetch('/me/applications');
      expect(r.status, `status ${status}`).toBe(status);
      expect(fetchMock, `status ${status}`).toHaveBeenCalledTimes(1);
    }
  });
});

describe('apiFetch — the expired-session path', () => {
  it('refreshes once on 401 and retries the original request', async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: unknown) => {
      const u = String(url);
      calls.push(u);
      if (u.endsWith('/auth/refresh')) return res(200);
      // 401 first, then success once the session is refreshed.
      return calls.filter((c) => c.endsWith('/me/applications')).length === 1
        ? res(401, { message: 'No access token' })
        : res(201, { id: 7 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = await apiFetch('/me/applications', { method: 'POST' });

    expect(r.status).toBe(201);
    expect(calls).toEqual([
      `${API}/me/applications`,
      `${API}/auth/refresh`,
      `${API}/me/applications`,
    ]);
  });

  it('returns the ORIGINAL 401 when the refresh also fails', async () => {
    // The caller should see the real reason — "No access token" — rather than a
    // synthesised error from the retry.
    const fetchMock = vi.fn(async (url: unknown) =>
      String(url).endsWith('/auth/refresh') ? res(401) : res(401, { message: 'No access token' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const r = await apiFetch('/me/applications');
    const body = (await r.json()) as { message: string };

    expect(r.status).toBe(401);
    expect(body.message).toBe('No access token');
    // original + refresh, and NO retry after a failed refresh
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries at most once, so a still-401 response cannot loop', async () => {
    const fetchMock = vi.fn(async (url: unknown) =>
      String(url).endsWith('/auth/refresh') ? res(200) : res(401),
    );
    vi.stubGlobal('fetch', fetchMock);

    const r = await apiFetch('/me/applications');

    expect(r.status).toBe(401);
    // original + refresh + exactly one retry
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('treats a network failure during refresh as "not refreshed", not a crash', async () => {
    const fetchMock = vi.fn(async (url: unknown) => {
      if (String(url).endsWith('/auth/refresh')) throw new TypeError('network down');
      return res(401, { message: 'No access token' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = await apiFetch('/me/applications');
    expect(r.status).toBe(401);
  });
});

describe('apiFetch — single-flight refresh (token rotation safety)', () => {
  it('fires ONE refresh for many simultaneous 401s', async () => {
    let refreshCount = 0;
    const seen = new Map<string, number>();
    const fetchMock = vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.endsWith('/auth/refresh')) {
        refreshCount += 1;
        // Real refreshes are not instant; the delay is what would let a
        // naive implementation start a second one.
        await new Promise((r) => setTimeout(r, 20));
        return res(200);
      }
      const n = (seen.get(u) ?? 0) + 1;
      seen.set(u, n);
      return n === 1 ? res(401) : res(200);
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await Promise.all([
      apiFetch('/me/a'),
      apiFetch('/me/b'),
      apiFetch('/me/c'),
      apiFetch('/me/d'),
    ]);

    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    // The whole point: four 401s, one rotation.
    expect(refreshCount).toBe(1);
  });

  it('allows a LATER refresh after the first has settled', async () => {
    // The in-flight promise is cleared in `finally`, so a session that expires
    // again an hour later can still be refreshed. Without that, one refresh per
    // page load would be the limit.
    let refreshCount = 0;
    const seen = new Map<string, number>();
    const fetchMock = vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.endsWith('/auth/refresh')) {
        refreshCount += 1;
        return res(200);
      }
      const n = (seen.get(u) ?? 0) + 1;
      seen.set(u, n);
      return n === 1 ? res(401) : res(200);
    });
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/me/first');
    await apiFetch('/me/second');

    expect(refreshCount).toBe(2);
  });
});
