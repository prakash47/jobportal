// Support console reads. Thin wrappers over the AdminGuard'd endpoints in
// apps/api — see types.ts for why this console reads the API rather than Prisma.
//
// ⚠ Reads ONLY. Status changes, staff replies and internal notes go through
// apps/api (PATCH /admin/support/tickets/:id, POST .../messages, POST
// .../notes), so AdminGuard, the audit row and the bell notification all apply.
// A prisma.supportTicket.update() here — or a server action wrapping one —
// would bypass every one of those.

import { adminApiGet, type AdminApiResult } from '../admin-api';
import { SUPPORT_PAGE_SIZE, tabToApiStatus, type SupportTab } from './format';
import type { ContactListResult, TicketDetail, TicketListResult } from './types';

/**
 * Build the API query string for the ticket list.
 *
 * Exported and pure so it can be tested without a fetch. The three things it has
 * to get right are all silent failures rather than crashes:
 *
 *  1. 'ALL' must become NO status param. The API DTO is `.strict()` with no ALL
 *     member, so `?status=ALL` is a 400 — an error state on the one tab that
 *     should never fail.
 *  2. `q` must be encodeURIComponent'd. A search for "R&D" would otherwise
 *     truncate at the ampersand and silently search for "R", and a `#` would
 *     drop the rest of the query entirely.
 *  3. page 1 must be OMITTED, not sent as `page=1`, so the API sees the same
 *     request the default view makes.
 */
export function ticketListQuery(tab: SupportTab, page: number, q?: string): string {
  const params = new URLSearchParams();
  const status = tabToApiStatus(tab);
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function listTickets(
  tab: SupportTab,
  page: number,
  q?: string,
): Promise<AdminApiResult<TicketListResult>> {
  return adminApiGet<TicketListResult>(
    `/admin/support/tickets${ticketListQuery(tab, page, q)}`,
  );
}

export function getTicket(id: number): Promise<AdminApiResult<TicketDetail>> {
  return adminApiGet<TicketDetail>(`/admin/support/tickets/${id}`);
}

export function listContactMessages(page: number): Promise<AdminApiResult<ContactListResult>> {
  const qs = page > 1 ? `?page=${page}` : '';
  return adminApiGet<ContactListResult>(`/admin/support/contact-messages${qs}`);
}

/**
 * The page size the console assumes when computing "last page" for an over-range
 * redirect.
 *
 * Prefers the API's own `pageSize` from the response and only falls back to the
 * local constant, because the two living in different packages is exactly how
 * they drift. Re-exported here so the pages have one import site.
 */
export function pageSizeOf(result: { pageSize?: number }): number {
  return typeof result.pageSize === 'number' && result.pageSize > 0
    ? result.pageSize
    : SUPPORT_PAGE_SIZE;
}
