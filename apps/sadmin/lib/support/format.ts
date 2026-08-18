// Pure logic for the Support & Communication console — status tabs, labels and
// URL building. No JSX, no Prisma, no `new Date()`: anything that needs "now"
// takes it as an argument, so the tests are deterministic. Same discipline as
// lib/reports/format.ts and lib/job-postings/format.ts.

import type { SupportTicketCategory, SupportTicketStatus } from '@jobportal/db';

/** Tickets per page. Must match the API's PAGE_SIZE — see SUPPORT_PAGE_SIZE. */
export const SUPPORT_PAGE_SIZE = 20;

// The portal-wide offset-pagination rules and `?q` handling, re-exported rather
// than copied — two clamps or two trims that disagree means `?q=` and a missing
// `q` stop being the same state on one table and not the other.
export { clampPage, lastPageFor } from '../employers/format';
export { firstParam, normalizeQuery } from '../candidates/format';

/**
 * The status tabs, in the order they render.
 *
 * OPEN is FIRST and is the default: this console exists to be worked, and the
 * question it is usually opened to answer is "what has come in that nobody has
 * dealt with". 'ALL' is last — the escape hatch, not the starting point.
 *
 * ⚠ CLOSED IS A TAB, even though the owner's brief named three states
 * (Open/In Progress/Resolved). It is not decoration: a RECRUITER can close their
 * own ticket (RecruiterSupportService), so tickets arrive in CLOSED without any
 * staff action, and the API 409s a reply to one. Hiding the tab would make those
 * tickets unreachable from this console while they kept being created — the
 * worst of both, since staff would have no way to see or reopen them.
 *
 * A readonly TUPLE rather than a Record, and that is load-bearing:
 * `parseSupportTab` validates by MEMBERSHIP against this array, never by
 * indexing an object with the raw param. `?status=__proto__` indexing a plain
 * object returns a truthy inherited value and would sail through an
 * `if (MAP[raw])` check — the prototype-chain class of bug already shipped once
 * on the SRP.
 */
export const SUPPORT_TABS = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'ALL'] as const;

export type SupportTab = (typeof SUPPORT_TABS)[number];

/** The tab shown when `?status` is absent, unknown, or malformed. */
export const DEFAULT_SUPPORT_TAB: SupportTab = 'OPEN';

/**
 * Labels for a ticket's lifecycle state.
 *
 * `Record<SupportTicketStatus, string>`, never `Record<string, string>`: the
 * shipped /admin console used a widened record with a `?? item.category`
 * fallback, which prints raw SCREAMING_SNAKE to staff the moment a member is
 * added. A typed record makes that a compile error instead.
 */
export const SUPPORT_STATUS_LABEL: Record<SupportTicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

/** Tab labels — the status labels plus the 'ALL' pseudo-status. */
export const SUPPORT_TAB_LABEL: Record<SupportTab, string> = {
  ...SUPPORT_STATUS_LABEL,
  ALL: 'All',
};

/**
 * What the ticket is about, as the recruiter chose it when raising it.
 *
 * Duplicated from the recruiter portal's own map rather than imported because
 * tsconfig.base.json has no path alias reaching `apps/`, so sadmin structurally
 * cannot import from another app — the same constraint lib/reports/format.ts
 * documents for its reason labels, and @jobportal/types is an empty stub. A test
 * pins the full key set, so a new SupportTicketCategory member is a compile
 * error here rather than raw SCREAMING_SNAKE in front of a staff member.
 */
export const SUPPORT_CATEGORY_LABEL: Record<SupportTicketCategory, string> = {
  ACCOUNT: 'Account',
  JOB_POSTING: 'Job posting',
  APPLICANTS: 'Applicants',
  VERIFICATION: 'Verification',
  BILLING: 'Billing',
  TECHNICAL: 'Technical',
  OTHER: 'Other',
};

export function formatSupportStatus(status: SupportTicketStatus): string {
  return SUPPORT_STATUS_LABEL[status];
}

export function formatSupportCategory(category: SupportTicketCategory): string {
  return SUPPORT_CATEGORY_LABEL[category];
}

/**
 * Whether a ticket is still workable — the two states that need staff attention.
 *
 * RESOLVED is NOT workable but is also not final: a recruiter reply reopens it
 * to IN_PROGRESS. CLOSED is the only genuinely terminal state, and even that is
 * reversible by a staff status change.
 */
export function isOpenTicket(status: SupportTicketStatus): boolean {
  return status === 'OPEN' || status === 'IN_PROGRESS';
}

/**
 * The noun phrase for a count on each tab, singular and plural.
 *
 * Spelled out rather than templated off the status label, for the reason
 * lib/reports/format.ts records: the labels are a mix of adjectives ("Open",
 * "Resolved") and a prepositional phrase ("In progress"), and no single word
 * order reads correctly for all of them.
 */
const SUPPORT_TAB_NOUN: Record<SupportTab, { one: string; many: string }> = {
  OPEN: { one: 'open ticket', many: 'open tickets' },
  IN_PROGRESS: { one: 'ticket in progress', many: 'tickets in progress' },
  RESOLVED: { one: 'resolved ticket', many: 'resolved tickets' },
  CLOSED: { one: 'closed ticket', many: 'closed tickets' },
  ALL: { one: 'ticket', many: 'tickets' },
};

/**
 * The one line above the table, covering both the counted and the empty case.
 *
 * This is the sentence a screen-reader user hears when a search narrows the list
 * to nothing, and the page's `role="status"` region renders nothing else — so it
 * lives here where it is unit-testable rather than inline in the page.
 *
 * The empty copy never claims more than it knows. "No tickets have been raised
 * yet" is only true on the ALL tab with no search; every other tab is filtered,
 * and this console is filtered BY DEFAULT since OPEN is the landing tab —
 * exactly when a bare "nothing here" misleads most. A staff member seeing "There
 * are no open tickets right now" has learned something true and useful; one
 * seeing "no tickets" would wrongly conclude support is broken.
 */
export function formatTicketsSummary(total: number, status: SupportTab, q?: string): string {
  const noun = SUPPORT_TAB_NOUN[status];
  if (total === 0) {
    if (q) return `No ${noun.many} match “${q}”.`;
    if (status === 'ALL') return 'No tickets have been raised yet.';
    return `There are no ${noun.many} right now.`;
  }
  const counted = `${total.toLocaleString('en-IN')} ${total === 1 ? noun.one : noun.many}`;
  return q ? `${counted} matching “${q}”` : counted;
}

/**
 * Fold the raw `?status` into one of the known tabs.
 *
 * Falls back to OPEN for absent, unknown, malformed or repeated input rather
 * than 400ing — a hand-edited or stale bookmarked URL should land a staff member
 * on the default view, not an error page. Three inputs this must survive, all of
 * which have bitten this codebase before: a repeated key arriving as an ARRAY,
 * an unknown value reaching the API's status filter (where the DTO would 400 and
 * the page would render its error state), and `?status=__proto__` resolving
 * through an object's prototype chain — hence the tuple `.includes()` check.
 */
export function parseSupportTab(raw: string | string[] | undefined): SupportTab {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== 'string') return DEFAULT_SUPPORT_TAB;
  const upper = first.trim().toUpperCase();
  // Membership against the tuple — never `SOME_MAP[upper]`. See SUPPORT_TABS.
  return (SUPPORT_TABS as readonly string[]).includes(upper)
    ? (upper as SupportTab)
    : DEFAULT_SUPPORT_TAB;
}

/**
 * The `?status` value to send the API, or undefined for the ALL tab.
 *
 * 'ALL' is a UI concept only — the API's ListTicketsQueryDto is `.strict()` and
 * its status enum has no ALL member, so sending it verbatim is a 400 and an
 * error state on the one tab that should always work. This is the single place
 * that translation happens.
 */
export function tabToApiStatus(tab: SupportTab): SupportTicketStatus | undefined {
  return tab === 'ALL' ? undefined : tab;
}

/**
 * Shared by the status tabs, the pagination links AND the over-range redirect,
 * so no two of them can build different URLs for the same state.
 *
 * Every param is carried through, which is the whole reason the builder exists:
 * clicking a status tab must narrow the current view rather than silently wiping
 * the admin's active search. Params are emitted in a FIXED order (status, q,
 * page) and defaults are omitted, so `/support` and `?status=OPEN&page=1` are
 * the same URL.
 *
 * basePath-relative: Next adds '/sadmin' itself. Writing '/sadmin/support' here
 * would resolve to /sadmin/sadmin/support.
 */
export function supportHref(status: SupportTab, page: number, q?: string): string {
  const params = new URLSearchParams();
  if (status !== DEFAULT_SUPPORT_TAB) params.set('status', status);
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/support?${qs}` : '/support';
}

/**
 * Link from a queue row to that ticket's detail page, carrying the list state
 * the admin is currently looking at, so the detail page's Back link returns to
 * the exact filtered page they left rather than an unfiltered page 1.
 *
 * Carries the three PARAMS rather than a `?from=` URL: a free-form return URL
 * off the query string is an open-redirect surface, whereas these three are
 * re-encoded here and decoded on the far side by the very same parseSupportTab /
 * normalizeQuery / clampPage this file exports.
 */
export function ticketDetailHref(id: number, status: SupportTab, page: number, q?: string): string {
  const params = new URLSearchParams();
  if (status !== DEFAULT_SUPPORT_TAB) params.set('status', status);
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/support/${id}?${qs}` : `/support/${id}`;
}

/** The contact-message inbox, which carries only a page. */
export function contactMessagesHref(page: number): string {
  return page > 1 ? `/support/messages?page=${page}` : '/support/messages';
}

/**
 * Whether staff can reply on this ticket.
 *
 * CLOSED only blocks REPLIES — the API 409s them — not status changes and not
 * notes. This is the UI half (L2); the API is what actually enforces it.
 */
export function canReply(status: SupportTicketStatus): boolean {
  return status !== 'CLOSED';
}

/**
 * How the console names a person — the ticket raiser, or a note's author.
 *
 * ⚠ A blank or whitespace-only `User.name` is a REACHABLE state, not a
 * defensive hypothetical: `apps/api/src/recruiter-profile/dto.ts` validates the
 * name as `z.string().min(1).max(120)` with **no `.trim()`**, so `"   "` passes
 * and is written straight through. Printing it raw yields an empty cell in the
 * "Raised by" column and a header reading "raised by  (p@acme.com)", plus a
 * problem statement headed "  wrote" — the console silently losing the identity
 * of the person it is about. Falling back to the email is what every other
 * identity-rendering surface in this portal does.
 */
export function formatPersonName(person: { name: string; email: string }): string {
  return person.name.trim() || person.email;
}

/**
 * How the console names a note's author.
 *
 * `null` means the User id on the note no longer resolves — the admin account
 * was deleted. The note deliberately survives that (authorId is a loose id with
 * no FK, so the record outlives the account), and it reads as a plain phrase
 * rather than an em dash so it cannot be mistaken for "no author was recorded".
 */
export function formatNoteAuthor(author: { name: string; email: string } | null): string {
  if (author == null) return 'Unknown admin';
  return formatPersonName(author);
}

/**
 * The count line above the notes list.
 *
 * States the audience explicitly on EVERY render, including the empty one. The
 * whole risk of this feature is a staff member mistaking the note box for the
 * reply box and writing a candid internal assessment into a field the customer
 * reads — so the promise that nobody outside the console sees it has to be
 * present at the moment of writing, not in a tooltip.
 */
export function formatNotesSummary(count: number): string {
  if (count === 0) return 'No internal notes yet. Notes are visible to staff only.';
  return count === 1
    ? '1 internal note. Visible to staff only.'
    : `${count.toLocaleString('en-IN')} internal notes. Visible to staff only.`;
}
