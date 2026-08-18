// Pure logic for the content-report queue — status tabs, labels and URL
// building. No JSX, no Prisma, no `new Date()`: anything that needs "now" takes
// it as an argument, so the tests are deterministic. Same discipline as
// lib/job-postings/format.ts and lib/subscriptions/format.ts.

import type { ContentReportReason, ContentReportStatus, JobStatus } from '@jobportal/db';

/** Reports per page. Matches every other table in the portal. */
export const REPORTS_PAGE_SIZE = 20;

// The portal-wide offset-pagination rules and `?q` handling, re-exported rather
// than copied — two clamps or two trims that disagree means `?q=` and a missing
// `q` stop being the same state on one table and not the other.
export { clampPage, lastPageFor } from '../employers/format';
export { firstParam, normalizeQuery } from '../candidates/format';
// Prisma's `contains` compiles to an unescaped LIKE, so `?q=%` would match every
// report. Shared with the job-postings console for the same reason.
export { escapeLikePattern } from '../job-postings/format';

/**
 * The status tabs, in the order they render.
 *
 * OPEN is FIRST and is the default: this console exists to be worked, and the
 * only question it is usually opened to answer is "what has come in that nobody
 * has dealt with". 'ALL' is last — the escape hatch, not the starting point.
 *
 * A readonly TUPLE rather than a Record, and that is load-bearing:
 * `parseReportTab` validates by MEMBERSHIP against this array, never by indexing
 * an object with the raw param. `?status=__proto__` indexing a plain object
 * returns a truthy inherited value and would sail through an `if (MAP[raw])`
 * check — the prototype-chain class of bug already shipped once on the SRP.
 */
export const REPORT_TABS = ['OPEN', 'REVIEWING', 'ACTIONED', 'DISMISSED', 'ALL'] as const;

export type ReportTab = (typeof REPORT_TABS)[number];

/** The tab shown when `?status` is absent, unknown, or malformed. */
export const DEFAULT_REPORT_TAB: ReportTab = 'OPEN';

/**
 * Labels for a report's triage state.
 *
 * ACTIONED reads as **Upheld** rather than "Actioned". The enum member records a
 * JUDGEMENT — the schema is explicit that ACTIONED means the report was upheld
 * and DISMISSED means the content was found acceptable — and "Actioned" is
 * process jargon that says something happened without saying which way it went.
 * The button that produces this state is labelled "Uphold" for the same reason.
 *
 * `Record<ContentReportStatus, string>`, never `Record<string, string>`: a
 * widened record in this codebase has already invented members that do not exist
 * while omitting a real one, which then rendered raw SCREAMING_SNAKE to staff.
 */
export const REPORT_STATUS_LABEL: Record<ContentReportStatus, string> = {
  OPEN: 'Open',
  REVIEWING: 'In review',
  ACTIONED: 'Upheld',
  DISMISSED: 'Dismissed',
};

/** Tab labels — the status labels plus the 'ALL' pseudo-status. */
export const REPORT_TAB_LABEL: Record<ReportTab, string> = {
  ...REPORT_STATUS_LABEL,
  ALL: 'All',
};

/**
 * Why the reporter says the content is a problem.
 *
 * ⚠ These strings are VERBATIM the options apps/web shows the reporter
 * (apps/web/lib/job/report.ts). Staff must read the exact choice that was made,
 * not a paraphrase of it — a console that rewords "Misleading details (salary,
 * role or location)" into "Misleading" quietly discards the part that tells a
 * moderator where to look.
 *
 * Duplicated rather than imported because tsconfig.base.json has no path alias
 * reaching `apps/`, so sadmin structurally cannot import from another app — the
 * same constraint lib/job-postings/format.ts documents for its job-type labels,
 * and @jobportal/types is an empty stub. A test pins the full key set, so a new
 * ContentReportReason member is a compile error here rather than a raw
 * SCREAMING_SNAKE string in front of a moderator.
 */
export const REPORT_REASON_LABEL: Record<ContentReportReason, string> = {
  FAKE_OR_SCAM: 'Fake or scam listing',
  MISLEADING: 'Misleading details (salary, role or location)',
  DISCRIMINATORY: 'Discriminatory language',
  OFFENSIVE: 'Offensive or inappropriate content',
  DUPLICATE: 'Duplicate of another posting',
  OTHER: 'Something else',
};

export function formatReportStatus(status: ContentReportStatus): string {
  return REPORT_STATUS_LABEL[status];
}

export function formatReportReason(reason: ContentReportReason): string {
  return REPORT_REASON_LABEL[reason];
}

/** Whether a report is still workable — the two non-terminal states. */
export function isOpenReport(status: ContentReportStatus): boolean {
  return status === 'OPEN' || status === 'REVIEWING';
}

/**
 * The noun phrase for a count on each tab, singular and plural.
 *
 * Spelled out rather than templated off the status label, for the reason
 * lib/job-postings/format.ts records: the labels are a mix of adjectives
 * ("Open", "Upheld") and a prepositional phrase ("In review"), and no single
 * word order reads correctly for all of them.
 */
const REPORT_TAB_NOUN: Record<ReportTab, { one: string; many: string }> = {
  OPEN: { one: 'open report', many: 'open reports' },
  REVIEWING: { one: 'report in review', many: 'reports in review' },
  ACTIONED: { one: 'upheld report', many: 'upheld reports' },
  DISMISSED: { one: 'dismissed report', many: 'dismissed reports' },
  ALL: { one: 'report', many: 'reports' },
};

/**
 * The one line above the table, covering both the counted and the empty case.
 *
 * This is the sentence a screen-reader user hears when a search narrows the list
 * to nothing, and the page's `role="status"` region renders nothing else — so it
 * lives here where it is unit-testable rather than inline in the page.
 *
 * The empty copy never claims more than it knows. "No reports have been filed
 * yet" is only true on the ALL tab with no search; every other tab is filtered,
 * and this console is filtered BY DEFAULT since OPEN is the landing tab —
 * exactly when a bare "nothing here" misleads most. An admin seeing "No open
 * reports right now" has learned something true and useful; one seeing "no
 * reports" would wrongly conclude the feature is broken.
 */
export function formatReportsSummary(total: number, status: ReportTab, q?: string): string {
  const noun = REPORT_TAB_NOUN[status];
  if (total === 0) {
    if (q) return `No ${noun.many} match “${q}”.`;
    if (status === 'ALL') return 'No reports have been filed yet.';
    return `There are no ${noun.many} right now.`;
  }
  const counted = `${total.toLocaleString('en-IN')} ${total === 1 ? noun.one : noun.many}`;
  return q ? `${counted} matching “${q}”` : counted;
}

/**
 * Fold the raw `?status` into one of the known tabs.
 *
 * Falls back to OPEN for absent, unknown, malformed or repeated input rather
 * than 400ing — a hand-edited or stale bookmarked URL should land an admin on
 * the default view, not an error page. Three inputs this must survive, all of
 * which have bitten this codebase before: a repeated key arriving as an ARRAY,
 * an unknown value reaching `where.status` (where Prisma raises rather than
 * degrading), and `?status=__proto__` resolving through an object's prototype
 * chain — hence the tuple `.includes()` check.
 */
export function parseReportTab(raw: string | string[] | undefined): ReportTab {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== 'string') return DEFAULT_REPORT_TAB;
  const upper = first.trim().toUpperCase();
  // Membership against the tuple — never `SOME_MAP[upper]`. See REPORT_TABS.
  return (REPORT_TABS as readonly string[]).includes(upper)
    ? (upper as ReportTab)
    : DEFAULT_REPORT_TAB;
}

/**
 * Shared by the status tabs, the pagination links AND the over-range redirect,
 * so no two of them can build different URLs for the same state.
 *
 * Every param is carried through, which is the whole reason the builder exists:
 * clicking a status tab must narrow the current view rather than silently wiping
 * the admin's active search. Params are emitted in a FIXED order (status, q,
 * page) and defaults are omitted, so `/reports` and `?status=OPEN&page=1` are
 * the same URL.
 *
 * basePath-relative: Next adds '/sadmin' itself. Writing '/sadmin/reports' here
 * would resolve to /sadmin/sadmin/reports.
 */
export function reportsHref(status: ReportTab, page: number, q?: string): string {
  const params = new URLSearchParams();
  if (status !== DEFAULT_REPORT_TAB) params.set('status', status);
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/reports?${qs}` : '/reports';
}

/**
 * Link from a queue row to that report's detail page, carrying the list state
 * the admin is currently looking at, so the detail page's Back link returns to
 * the exact filtered page they left rather than an unfiltered page 1.
 *
 * Carries the three PARAMS rather than a `?from=` URL: a free-form return URL
 * off the query string is an open-redirect surface, whereas these three are
 * re-encoded here and decoded on the far side by the very same parseReportTab /
 * normalizeQuery / clampPage this file exports.
 */
export function reportDetailHref(id: number, status: ReportTab, page: number, q?: string): string {
  const params = new URLSearchParams();
  if (status !== DEFAULT_REPORT_TAB) params.set('status', status);
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/reports/${id}?${qs}` : `/reports/${id}`;
}

/**
 * Whether the reported posting can be taken down.
 *
 * ACTIVE only. A takedown is a force-close, so there is nothing to close on a
 * posting that is already CLOSED or EXPIRED, and a DRAFT or PENDING_MODERATION
 * job was never public in the first place (it also cannot be reported —
 * isPubliclyReadable gates intake — so those two are only reachable if the
 * recruiter reverted the job after the report was filed).
 *
 * This is the UI half (L2) only. The API re-checks the same invariant inside the
 * UPDATE's WHERE clause and 409s otherwise, which is what actually enforces it;
 * this just avoids offering a control that would fail.
 */
export function canTakeDownJob(job: { status: JobStatus } | null): boolean {
  return job?.status === 'ACTIVE';
}

/**
 * Why the takedown is unavailable, for the disabled control's accessible name.
 * Returns null when it IS available, so the caller can treat "no reason" and
 * "enabled" as one state.
 */
export function takedownBlockedReason(job: { status: JobStatus } | null): string | null {
  if (canTakeDownJob(job)) return null;
  if (job == null) return 'this report does not name a posting';
  if (job.status === 'CLOSED') return 'this posting is already closed';
  if (job.status === 'EXPIRED') return 'this posting has already expired';
  return 'this posting is not live';
}

/**
 * How the queue names a reporter.
 *
 * Anonymous is the COMMON case, not an error state: /job/[slug] is public and
 * mostly logged-out, and the intake endpoint deliberately accepts unattributed
 * reports because requiring an account would suppress exactly the fake-job
 * reports most worth having. It reads as plain "Anonymous" rather than an em
 * dash so it cannot be mistaken for missing data.
 *
 * ⚠ The reporter's IP is never an input here. It is stored for abuse triage and
 * is cut at the SELECT, not hidden at render.
 */
export function formatReporter(reporter: { name: string; email: string } | null): string {
  if (reporter == null) return 'Anonymous';
  return reporter.name.trim() || reporter.email;
}

/**
 * The "this posting has been reported before" line.
 *
 * The schema added `@@index([jobId, status])` specifically so the console could
 * show this: a job reported forty times must not read as forty separate
 * problems. It also absorbs the known duplicate-report race — the one-open-
 * report-per-person rule is a check-then-insert with no partial unique index, so
 * two OPEN rows from one person are possible and the console is expected to
 * dedupe visually.
 *
 * `others` counts open reports against the same posting EXCLUDING this one.
 */
export function formatOtherOpenReports(others: number): string | null {
  if (others <= 0) return null;
  return others === 1
    ? '1 other open report names this posting.'
    : `${others.toLocaleString('en-IN')} other open reports name this posting.`;
}
