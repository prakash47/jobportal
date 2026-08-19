// Pure logic for the Broadcast Notifications console — tabs, labels, URL
// building and the sentences that have to tell the truth about reach. No JSX, no
// Prisma, no `new Date()`: anything that needs "now" takes it as an argument, so
// the tests are deterministic. Same discipline as lib/support/format.ts.

import type {
  BroadcastCategory,
  BroadcastRecipientStatus,
  BroadcastSegment,
  BroadcastStatus,
} from '@jobportal/db';

/** Broadcasts per page. Must match the API's PAGE_SIZE. */
export const BROADCAST_PAGE_SIZE = 20;

// Portal-wide pagination and `?q` handling, re-exported rather than copied — two
// clamps or two trims that disagree means `?q=` and a missing `q` stop being the
// same state on one console and not another.
export { clampPage, lastPageFor } from '../employers/format';
export { firstParam, normalizeQuery } from '../candidates/format';
// How this portal names a person, including the blank-User.name case that
// recruiter-profile's `.min(1)` with no `.trim()` makes reachable.
export { formatPersonName } from '../support/format';

/**
 * The status tabs, in the order they render.
 *
 * 'ALL' is FIRST and is the DEFAULT here, unlike the support console where OPEN
 * leads. That difference is deliberate: support is a QUEUE, and the question it
 * is opened to answer is "what has nobody dealt with". This is a LOG. A draft is
 * not waiting on anyone but the person who wrote it, and a sent broadcast needs
 * no action at all — so landing on a filtered view would hide the history that
 * is the reason to open the page.
 *
 * A readonly TUPLE rather than a Record, and that is load-bearing:
 * `parseBroadcastTab` validates by MEMBERSHIP against this array, never by
 * indexing an object with the raw param. `?status=__proto__` indexing a plain
 * object returns a truthy inherited value and would sail through an
 * `if (MAP[raw])` check — a bug that shipped once on the SRP.
 */
export const BROADCAST_TABS = [
  'ALL',
  'DRAFT',
  'SENDING',
  'SENT',
  'CANCELLED',
  'FAILED',
] as const;

export type BroadcastTab = (typeof BROADCAST_TABS)[number];

/** The tab shown when `?status` is absent, unknown, or malformed. */
export const DEFAULT_BROADCAST_TAB: BroadcastTab = 'ALL';

/**
 * Labels for a broadcast's lifecycle state.
 *
 * `Record<BroadcastStatus, string>`, never `Record<string, string>` with a
 * `?? raw` fallback: the shipped /admin console used a widened record and
 * printed raw SCREAMING_SNAKE to staff the moment a member was added. A typed
 * record makes that a compile error instead.
 *
 * "Sending" rather than "In progress" because that is what is happening and
 * because it is the one state where the numbers on screen are still moving.
 */
export const BROADCAST_STATUS_LABEL: Record<BroadcastStatus, string> = {
  DRAFT: 'Draft',
  SENDING: 'Sending',
  SENT: 'Sent',
  CANCELLED: 'Cancelled',
  FAILED: 'Failed',
};

export const BROADCAST_TAB_LABEL: Record<BroadcastTab, string> = {
  ALL: 'All',
  ...BROADCAST_STATUS_LABEL,
};

/**
 * Segment names as staff read them.
 *
 * ⚠ These say what the segment ACTUALLY resolves to, not what it is called.
 * "All recruiters" would be a small lie — deactivated recruiters are excluded by
 * `broadcastEmailWhere`, and an admin comparing this console's count against the
 * dashboard's recruiter figure needs to know why they differ. Staff (ADMIN
 * accounts) are excluded from every segment for the same reason.
 */
export const BROADCAST_SEGMENT_LABEL: Record<BroadcastSegment, string> = {
  ALL_CANDIDATES: 'All job seekers',
  ALL_RECRUITERS: 'All active recruiters',
  ALL_USERS: 'Everyone (seekers + active recruiters)',
};

export const BROADCAST_CATEGORY_LABEL: Record<BroadcastCategory, string> = {
  OPERATIONAL: 'Operational notice',
  PROMOTIONAL: 'Promotional',
};

export const BROADCAST_RECIPIENT_STATUS_LABEL: Record<BroadcastRecipientStatus, string> = {
  PENDING: 'Not sent yet',
  SENT: 'Sent',
  SKIPPED: 'Skipped',
  FAILED: 'Failed',
};

/** Indian digit grouping, as every other count in this portal renders. */
export function formatCount(n: number): string {
  return n.toLocaleString('en-IN');
}

export function formatBroadcastStatus(status: BroadcastStatus): string {
  return BROADCAST_STATUS_LABEL[status];
}

export function formatBroadcastSegment(segment: BroadcastSegment): string {
  return BROADCAST_SEGMENT_LABEL[segment];
}

export function formatBroadcastCategory(category: BroadcastCategory): string {
  return BROADCAST_CATEGORY_LABEL[category];
}

/**
 * Whether this broadcast still has moving parts.
 *
 * Used to decide whether the detail page's numbers are a live count or a frozen
 * record — a distinction the page states rather than leaving the reader to
 * infer from numbers that change on refresh.
 */
export function isInFlight(status: BroadcastStatus): boolean {
  return status === 'SENDING';
}

/** Only a draft can be edited, test-sent or dispatched. */
export function isEditable(status: BroadcastStatus): boolean {
  return status === 'DRAFT';
}

/** A draft can be abandoned; a send in flight can be stopped. Nothing else. */
export function canCancel(status: BroadcastStatus): boolean {
  return status === 'DRAFT' || status === 'SENDING';
}

/** The channel line: "Email and in-app", "Email", "In-app". */
export function formatChannels(emailEnabled: boolean, inAppEnabled: boolean): string {
  if (emailEnabled && inAppEnabled) return 'Email and in-app';
  if (emailEnabled) return 'Email';
  if (inAppEnabled) return 'In-app';
  // Unreachable through the API — the DTO rejects a channel-less broadcast — but
  // an em dash beats rendering an empty cell if a row ever arrives that way.
  return '—';
}

/**
 * The sentence describing who an in-app broadcast will actually reach.
 *
 * ⚠ THIS IS THE MOST IMPORTANT STRING IN THE CONSOLE. In-app notifications reach
 * RECRUITERS ONLY, whatever the segment says, because apps/web has no bell, no
 * feed and no read of the Notification table — a candidate row would be written
 * and rendered nowhere. An admin who ticks "in-app" on an Everyone broadcast and
 * is told it went out has been told something false, and would have no way to
 * discover it: the send reports success, the rows exist, and the only evidence
 * is that nobody on the seeker side ever mentions it.
 *
 * Returns null when there is nothing to warn about, so the caller renders no
 * note at all rather than an empty box.
 */
export function describeInAppReach(
  segment: BroadcastSegment,
  inAppEnabled: boolean,
): string | null {
  if (!inAppEnabled) return null;
  if (segment === 'ALL_CANDIDATES') {
    return 'In-app notifications cannot reach job seekers — the job-seeker site has no notification centre. Use email for this segment.';
  }
  if (segment === 'ALL_USERS') {
    return 'In-app notifications will reach recruiters only. Job seekers will get the email but nothing in-app, because the job-seeker site has no notification centre.';
  }
  return 'In-app notifications appear in the recruiter portal notification bell.';
}

/**
 * The one line above the table, covering both the counted and the empty case.
 *
 * This is the sentence a screen-reader user hears when a search narrows the list
 * to nothing, and the page's `role="status"` region renders nothing else — so it
 * lives here where it is unit-testable rather than inline in the page.
 *
 * The empty copy never claims more than it knows. "No broadcasts have been sent
 * yet" is only true on the ALL tab with no search; every other view is filtered,
 * and a bare "nothing here" on the Failed tab would read as "nothing has ever
 * failed" when it means "nothing failed among what you filtered to".
 */
export function formatBroadcastsSummary(
  total: number,
  tab: BroadcastTab,
  q?: string,
): string {
  const noun = total === 1 ? 'broadcast' : 'broadcasts';
  if (total === 0) {
    if (q) return `No ${noun} match “${q}”.`;
    if (tab === 'ALL') return 'No broadcasts yet. Compose one to get started.';
    return `There are no ${BROADCAST_TAB_LABEL[tab].toLowerCase()} broadcasts.`;
  }
  const counted = `${formatCount(total)} ${noun}`;
  if (tab !== 'ALL') {
    const qualified = `${counted} — ${BROADCAST_TAB_LABEL[tab].toLowerCase()}`;
    return q ? `${qualified}, matching “${q}”` : qualified;
  }
  return q ? `${counted} matching “${q}”` : counted;
}

/**
 * The delivery line: what actually happened to a dispatched broadcast.
 *
 * Skipped and failed are named separately and only when non-zero. Folding them
 * into a single "not delivered" would hide the distinction that matters: a
 * SKIPPED recipient is an account that no longer exists (nothing to fix), while
 * a FAILED one is an address the provider rejected (worth looking at).
 *
 * Takes the counts rather than the row so it can serve both the live progress on
 * a SENDING broadcast and the frozen record on a finished one.
 */
export function formatDeliverySummary(counts: {
  sent: number;
  skipped: number;
  failed: number;
  pending?: number;
}): string {
  const parts = [`${formatCount(counts.sent)} sent`];
  if (counts.skipped > 0) parts.push(`${formatCount(counts.skipped)} skipped`);
  if (counts.failed > 0) parts.push(`${formatCount(counts.failed)} failed`);
  if (counts.pending && counts.pending > 0) {
    parts.push(`${formatCount(counts.pending)} still queued`);
  }
  return parts.join(' · ');
}

/**
 * Fold the raw `?status` into one of the known tabs.
 *
 * Falls back to ALL for absent, unknown, malformed or repeated input rather than
 * 400ing — a hand-edited or stale bookmarked URL should land staff on the
 * default view, not an error page. Three inputs this must survive, all of which
 * have bitten this codebase: a repeated key arriving as an ARRAY, an unknown
 * value reaching the API's status filter (where the `.strict()` DTO would 400
 * and the page would render its error state), and `?status=__proto__` resolving
 * through an object's prototype chain — hence the tuple `.includes()` check.
 */
export function parseBroadcastTab(raw: string | string[] | undefined): BroadcastTab {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== 'string') return DEFAULT_BROADCAST_TAB;
  const upper = first.trim().toUpperCase();
  return (BROADCAST_TABS as readonly string[]).includes(upper)
    ? (upper as BroadcastTab)
    : DEFAULT_BROADCAST_TAB;
}

/**
 * The `?status` value to send the API, or undefined for the ALL tab.
 *
 * 'ALL' is a UI concept only — the API's ListBroadcastsQueryDto is `.strict()`
 * and its status enum has no ALL member, so sending it verbatim is a 400 and an
 * error state on the one tab that should always work. This is the single place
 * that translation happens.
 */
export function tabToApiStatus(tab: BroadcastTab): BroadcastStatus | undefined {
  return tab === 'ALL' ? undefined : tab;
}

/**
 * Shared by the status tabs, the pagination links AND the over-range redirect,
 * so no two of them can build different URLs for the same state.
 *
 * Params are emitted in a FIXED order and defaults are omitted, so `/broadcasts`
 * and `?status=ALL&page=1` are the same URL.
 *
 * basePath-relative: Next adds '/sadmin' itself. Writing '/sadmin/broadcasts'
 * here would resolve to /sadmin/sadmin/broadcasts.
 */
export function broadcastsHref(tab: BroadcastTab, page: number, q?: string): string {
  const params = new URLSearchParams();
  if (tab !== DEFAULT_BROADCAST_TAB) params.set('status', tab);
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/broadcasts?${qs}` : '/broadcasts';
}

/**
 * Link from a row to that broadcast's detail page, carrying the list state so
 * the detail page's Back link returns to the exact filtered page staff left.
 *
 * Carries the three PARAMS rather than a `?from=` URL: a free-form return URL
 * off the query string is an open-redirect surface, whereas these three are
 * re-encoded here and decoded on the far side by the same parseBroadcastTab /
 * normalizeQuery / clampPage this file exports.
 */
export function broadcastDetailHref(
  id: number,
  tab: BroadcastTab,
  page: number,
  q?: string,
): string {
  const params = new URLSearchParams();
  if (tab !== DEFAULT_BROADCAST_TAB) params.set('status', tab);
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/broadcasts/${id}?${qs}` : `/broadcasts/${id}`;
}

/** The composer. */
export function newBroadcastHref(): string {
  return '/broadcasts/new';
}
