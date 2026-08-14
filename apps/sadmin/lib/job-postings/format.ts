// Pure logic for the Job Postings master list — status tabs, labels and URL
// building. No JSX, no Prisma, no `new Date()`: anything that needs "now" takes
// it as an argument, so the tests are deterministic. Same discipline as
// lib/candidates/format.ts, lib/employers/format.ts and lib/jobs/format.ts.
//
// ⚠ This is NOT the job review queue. `lib/jobs/*` serves /sadmin/jobs, which is
// a moderation console: it shows only jobs awaiting a decision or already
// decided, and it deliberately refuses to filter on JobStatus (the reasoning is
// written out at ListAdminJobsQueryDto in apps/api). THIS module serves the
// master list, which shows every posting on the platform whatever its status —
// including the DRAFT, EXPIRED and never-moderated ACTIVE jobs that appear in
// neither review view. The two surfaces answer different questions and keep
// separate params, labels and href builders on purpose.

import type { JobStatus, JobType } from '@jobportal/db';

/**
 * Postings per page. Matches the candidate list, the employer list, the OTP
 * console and the job review queue, so every table in the portal pages alike.
 */
export const JOB_POSTINGS_PAGE_SIZE = 20;

// Page clamping and last-page arithmetic are the offset-pagination rules every
// table in this portal obeys, already unit-tested in ../employers/format.test.ts.
// Re-exported rather than copied — the same call lib/candidates/format.ts and
// lib/otp-sessions/format.ts make. Two clamps that disagree is a silently wrong
// ?page on one table and not the other.
export { clampPage, lastPageFor } from '../employers/format';

// `?q` handling is identical to the candidate list's — collapse a repeated key
// to its first value, then fold blank/whitespace to undefined. Re-exported for
// the same reason as the pagination helpers: a second copy that trims
// differently means `?q=` and a missing `q` stop being the same state on one
// table and not the other. firstParam in particular is not optional — a repeated
// `?q=a&q=b` reaching `raw.trim()` on an array is a real 500 this repo has
// already taken (see the note on firstParam itself).
export { firstParam, normalizeQuery } from '../candidates/format';

/**
 * The status tabs, in the order they render.
 *
 * ACTIVE is FIRST and is the default, because the question this console is
 * usually opened to answer is "what is live on the platform right now". 'ALL' is
 * last: it is the escape hatch, not the starting point — a fresh admin landing
 * on an unfiltered list of every draft and expired posting ever created learns
 * less than one landing on the live set.
 *
 * A readonly TUPLE rather than a Record, and that is load-bearing: `parseStatusTab`
 * validates by MEMBERSHIP against this array, never by indexing an object with
 * the raw param. `?status=__proto__` indexing a plain object returns a truthy
 * inherited value and would sail through a `if (MAP[raw])` check — the exact
 * prototype-chain class of bug already found once on the SRP.
 */
export const JOB_POSTING_TABS = [
  'ACTIVE',
  'PENDING_MODERATION',
  'DRAFT',
  'EXPIRED',
  'CLOSED',
  'ALL',
] as const;

export type JobPostingTab = (typeof JOB_POSTING_TABS)[number];

/** The tab shown when `?status` is absent, unknown, or malformed. */
export const DEFAULT_JOB_POSTING_TAB: JobPostingTab = 'ACTIVE';

/**
 * Labels for the job's own status, used by both the tabs and the row pill.
 *
 * `Record<JobStatus, string>`, never `Record<string, string>` — the reasoning is
 * written out at EMPLOYMENT_LABEL in ../jobs/format.ts and is not theoretical:
 * as a widened record that map invented members that do not exist while omitting
 * a real one, which then rendered raw SCREAMING_SNAKE to staff. Keyed by the
 * enum, a missing OR invented member is a compile error.
 *
 * ⚠ This repo has THREE live spellings of JobStatus.ACTIVE — 'Live'
 * (lib/candidates/format.ts), 'Open' (the job review detail page, and
 * lib/dashboard/queries.ts) and the enum word 'Active'. This surface uses
 * **Active**, which is what the console is named after, and 'Under review' for
 * PENDING_MODERATION — the spelling used in two other places and pinned by a
 * test in ../candidates/format.test.ts. The three existing maps are deliberately
 * left alone here: retitling shipped pages is a separate, reviewable change, and
 * a follow-up is logged in PROGRESS.md.
 */
export const JOB_POSTING_STATUS_LABEL: Record<JobStatus, string> = {
  DRAFT: 'Draft',
  PENDING_MODERATION: 'Under review',
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  CLOSED: 'Closed',
};

/** Tab labels — the status labels plus the 'ALL' pseudo-status. */
export const JOB_POSTING_TAB_LABEL: Record<JobPostingTab, string> = {
  ...JOB_POSTING_STATUS_LABEL,
  ALL: 'All',
};

export function formatJobPostingStatus(status: JobStatus): string {
  return JOB_POSTING_STATUS_LABEL[status];
}

/**
 * The commercial category of a posting (Job.jobType), NOT its employment type.
 *
 * Labels mirror apps/recruiter's JOB_TYPES verbatim, so the category a recruiter
 * chose when posting reads identically to staff reviewing it. Copied rather than
 * imported because tsconfig.base.json has no path alias reaching `apps/`, so
 * sadmin structurally cannot import from another app — the same constraint
 * lib/candidates/format.ts documents for its status labels.
 *
 * `Record<JobType, string>` for the usual reason: this field was previously
 * fetched and never rendered, and the first version of this page put the raw
 * column on screen, showing a super admin "FREE". A keyed record makes a missing
 * or invented member a compile error.
 */
const JOB_TYPE_LABEL: Record<JobType, string> = {
  FREE: 'Free Job',
  HOT_VACANCY: 'Hot Vacancy',
  SMB: 'SMB Pack',
  INTERNSHIP: 'Internship',
};

/**
 * Takes a plain string because the sadmin API types are hand-mirrored — the
 * detail payload declares `jobType: string`, not the Prisma enum (see
 * lib/jobs/types.ts). An unrecognised value falls back to itself rather than
 * throwing: this is a read-only staff screen, and a new JobType member shipped
 * by the API should not blank the whole page.
 *
 * ⚠ `Object.hasOwn` rather than `MAP[value] ?? value`, and this is a real bug
 * rather than defensive noise: `??` only falls back on null/undefined, but
 * `JOB_TYPE_LABEL['__proto__']` returns Object.prototype and
 * `JOB_TYPE_LABEL['toString']` returns a function — both truthy, so the
 * fallback never fires and a non-string reaches React, which renders
 * "[object Object]" or throws. The parameter is a plain string off an API
 * payload, so those values are genuinely reachable. This is the same
 * prototype-chain class of bug already found once on the SRP, and the reason
 * parseStatusTab above validates by tuple membership.
 */
export function formatJobType(value: string): string {
  return Object.hasOwn(JOB_TYPE_LABEL, value) ? JOB_TYPE_LABEL[value as JobType] : value;
}

/**
 * The noun phrase for a count on each tab, singular and plural.
 *
 * A table rather than `${count} postings ${label.toLowerCase()}` because that
 * template produces "1 posting draft" — the status labels are a mix of
 * adjectives ("Draft", "Active") and a prepositional phrase ("Under review"),
 * and no single word order reads correctly for both. Spelling the phrases out is
 * the only way all six read like English.
 */
const JOB_POSTING_TAB_NOUN: Record<JobPostingTab, { one: string; many: string }> = {
  ACTIVE: { one: 'active posting', many: 'active postings' },
  PENDING_MODERATION: { one: 'posting under review', many: 'postings under review' },
  DRAFT: { one: 'draft posting', many: 'draft postings' },
  EXPIRED: { one: 'expired posting', many: 'expired postings' },
  CLOSED: { one: 'closed posting', many: 'closed postings' },
  ALL: { one: 'posting', many: 'postings' },
};

/**
 * The one line above the table, covering both the counted and the empty case.
 *
 * Computed here rather than in the page so the wording is unit-testable — this
 * is the sentence a screen-reader user hears when a search narrows the list to
 * nothing, and the page's `role="status"` region renders nothing else.
 *
 * The empty copy must never claim more than it knows. "No jobs have been posted
 * yet" is only true on the ALL tab with no search; on every other tab the list
 * is filtered — and on this console it is filtered BY DEFAULT, since ACTIVE is
 * the landing tab — which is exactly when a bare "nothing here" misleads most.
 */
export function formatJobPostingsSummary(
  total: number,
  status: JobPostingTab,
  q?: string,
): string {
  const noun = JOB_POSTING_TAB_NOUN[status];
  if (total === 0) {
    if (q) return `No ${noun.many} match “${q}”.`;
    if (status === 'ALL') return 'No jobs have been posted yet.';
    return `There are no ${noun.many} right now.`;
  }
  const counted = `${total.toLocaleString('en-IN')} ${total === 1 ? noun.one : noun.many}`;
  return q ? `${counted} matching “${q}”` : counted;
}

/**
 * Fold the raw `?status` into one of the known tabs.
 *
 * Falls back to ACTIVE for absent, unknown, malformed or repeated input rather
 * than 400ing — a hand-edited or stale bookmarked URL should land an admin on
 * the default view, not an error page. Three inputs this must survive, all of
 * which have bitten this codebase before:
 *
 *   - `?status=a&status=b` arrives as an ARRAY (routed through firstParam).
 *   - `?status=whatever` must not reach `where.status`, where Prisma raises a
 *     validation error rather than falling back gracefully.
 *   - `?status=__proto__` must not resolve through an object's prototype chain
 *     — hence the tuple `.includes()` check rather than a map lookup.
 *
 * Case-insensitive so `?status=active` works, which is what someone hand-editing
 * the URL will type.
 */
export function parseStatusTab(raw: string | string[] | undefined): JobPostingTab {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== 'string') return DEFAULT_JOB_POSTING_TAB;
  const upper = first.trim().toUpperCase();
  // Membership against the tuple — never `SOME_MAP[upper]`. See JOB_POSTING_TABS.
  return (JOB_POSTING_TABS as readonly string[]).includes(upper)
    ? (upper as JobPostingTab)
    : DEFAULT_JOB_POSTING_TAB;
}

/**
 * Shared by the status tabs, the pagination links AND the over-range redirect,
 * so no two of them can build different URLs for the same state.
 *
 * Every param is carried through. This is the whole reason the builder exists:
 * the job review queue's private `pageHref` drops every param it does not know
 * about by construction, so copying its shape here would make clicking a status
 * tab silently wipe the admin's active search. Params are emitted in a FIXED
 * order (status, q, page) and defaults are omitted, keeping the canonical URL
 * clean — `/job-postings` and `/job-postings?status=ACTIVE&page=1` are the same
 * view and should be the same URL.
 *
 * basePath-relative: Next adds '/sadmin' itself. Writing '/sadmin/job-postings'
 * here would resolve to /sadmin/sadmin/job-postings.
 */
export function jobPostingsHref(status: JobPostingTab, page: number, q?: string): string {
  const params = new URLSearchParams();
  if (status !== DEFAULT_JOB_POSTING_TAB) params.set('status', status);
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/job-postings?${qs}` : '/job-postings';
}

/**
 * Link from a master-list row to that posting's detail page, carrying the list
 * state the admin is currently looking at.
 *
 * The round-trip is what lets the detail page's Back link return to the exact
 * filtered page the admin left, instead of dumping them on an unfiltered page 1
 * after every single View. It carries the three PARAMS rather than a `?from=`
 * URL for the reason spelled out at candidateDetailHref: a free-form return URL
 * off the query string is an open-redirect surface, whereas these three are
 * re-encoded here and decoded on the far side by the very same parseStatusTab /
 * normalizeQuery / clampPage this file exports.
 *
 * ⚠ Points at /job-postings/:id, NOT /jobs/:id. Linking to the moderation
 * detail route would visibly jump the sidebar highlight onto "Job review" —
 * SidebarNav's isActive matches on a `${href}/` prefix — and would land the
 * admin on a screen framed as a review decision.
 */
export function jobPostingDetailHref(
  id: number,
  status: JobPostingTab,
  page: number,
  q?: string,
): string {
  const params = new URLSearchParams();
  if (status !== DEFAULT_JOB_POSTING_TAB) params.set('status', status);
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/job-postings/${id}?${qs}` : `/job-postings/${id}`;
}

/**
 * Escape the LIKE wildcards in a search term.
 *
 * Prisma's `contains` compiles to `LIKE '%' || value || '%'` and does NOT escape
 * the value, so a `%` or `_` the admin typed is interpreted as a pattern rather
 * than matched literally: `?q=%` currently matches EVERY posting, and `?q=a_c`
 * matches "abc". Neither is what a search box means.
 *
 * Backslash first, or it would double-escape the escapes this function adds.
 * Postgres' default LIKE escape character IS backslash, so no ESCAPE clause is
 * needed — which matters, because Prisma gives no way to add one.
 *
 * Scoped to this feature rather than folded into the shared `normalizeQuery`:
 * that helper is re-exported to the candidate console, which has the same latent
 * issue, and silently changing a shipped surface's search semantics belongs in
 * its own reviewable change. Logged as a follow-up in PROGRESS.md.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Whether this posting can be hard-deleted.
 *
 * ZERO applications only. `Application` is `onDelete: Cascade` on Job, so
 * deleting a posting with responses destroys candidates' own application
 * history — rows they can still see in their /applications tracker. The owner
 * ruled on this for the recruiter delete on 2026-07-16 and this console inherits
 * it unchanged; a job with responses is CLOSED, not deleted.
 *
 * This is the UI half (L2) only. The API re-checks the same invariant inside the
 * delete statement's WHERE clause and 409s otherwise, which is what actually
 * enforces it — this function just avoids offering a button that would fail.
 */
export function canDeleteJobPosting(job: { applicationCount: number }): boolean {
  return job.applicationCount === 0;
}

/**
 * Why Delete is unavailable, for the disabled control's accessible name.
 *
 * Returns null when the posting IS deletable, so the caller can treat "no
 * reason" and "enabled" as one state.
 */
export function jobPostingDeleteBlockedReason(job: { applicationCount: number }): string | null {
  if (canDeleteJobPosting(job)) return null;
  return job.applicationCount === 1
    ? 'has 1 application — close it instead of deleting'
    : `has ${job.applicationCount.toLocaleString('en-IN')} applications — close it instead of deleting`;
}
