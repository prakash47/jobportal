// Broadcast console reads. Thin wrappers over the AdminGuard'd endpoints in
// apps/api — see types.ts for why this console reads the API rather than Prisma.
//
// ⚠ Reads ONLY. Compose, test-send, dispatch and cancel all go through apps/api
// (POST /admin/broadcasts, .../test-send, .../send, .../cancel), so AdminGuard,
// the killswitch and the audit row all apply. A prisma.broadcast.update() here —
// or a server action wrapping one — would bypass every one of those, and on this
// feature that means an unaudited message to the entire platform.

import { adminApiGet, type AdminApiResult } from '../admin-api';
import { BROADCAST_PAGE_SIZE, tabToApiStatus, type BroadcastTab } from './format';
import type { BroadcastDetail, BroadcastListResult } from './types';

/**
 * Build the API query string for the broadcast log.
 *
 * Exported and pure so it can be tested without a fetch. The three things it has
 * to get right are all silent failures rather than crashes:
 *
 *  1. 'ALL' must become NO status param. The API DTO is `.strict()` with no ALL
 *     member, so `?status=ALL` is a 400 — an error state on the default tab.
 *  2. `q` must be encodeURIComponent'd. A search for "R&D" would otherwise
 *     truncate at the ampersand and silently search for "R", and a `#` would
 *     drop the rest of the query entirely.
 *  3. page 1 must be OMITTED, not sent as `page=1`, so the API sees the same
 *     request the default view makes.
 */
export function broadcastListQuery(tab: BroadcastTab, page: number, q?: string): string {
  const params = new URLSearchParams();
  const status = tabToApiStatus(tab);
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function listBroadcasts(
  tab: BroadcastTab,
  page: number,
  q?: string,
): Promise<AdminApiResult<BroadcastListResult>> {
  return adminApiGet<BroadcastListResult>(`/admin/broadcasts${broadcastListQuery(tab, page, q)}`);
}

export function getBroadcast(id: number): Promise<AdminApiResult<BroadcastDetail>> {
  return adminApiGet<BroadcastDetail>(`/admin/broadcasts/${id}`);
}

/**
 * The page size the console assumes when computing "last page" for an over-range
 * redirect.
 *
 * Prefers the API's own `pageSize` from the response and only falls back to the
 * local constant, because the two living in different packages is exactly how
 * they drift.
 */
export function pageSizeOf(result: { pageSize?: number }): number {
  return typeof result.pageSize === 'number' && result.pageSize > 0
    ? result.pageSize
    : BROADCAST_PAGE_SIZE;
}
