// Pure logic for the Candidate Management console — headline precedence,
// initials, query normalisation and URL building. No JSX, no Prisma, no
// `new Date()`: anything that needs "now" takes it as an argument, so the tests
// are deterministic. Same discipline as lib/employers/format.ts and
// lib/jobs/format.ts.
//
// A "candidate" on this surface is a USER whose role is CANDIDATE — not a
// `Candidate` row. The distinction is load-bearing rather than pedantic; see
// ./queries.ts for the three ways a real registered seeker can have no
// `Candidate` row at all.

import type {
  ApplicationStatus,
  AuthProvider,
  Gender,
  JobStatus,
  LanguageProficiency,
  LookingFor,
  ProfileAuditAction,
  ResumeScanStatus,
  WorkStatus,
} from '@jobportal/db';

/**
 * Candidates per page in the master list. Matches the employer list, the OTP
 * console and the job review queue, so every table in the portal pages alike.
 */
export const CANDIDATES_PAGE_SIZE = 20;

/**
 * Per-section caps on the candidate detail page.
 *
 * Each section renders the latest N and states the true total beside it ("Latest
 * 20 of 137"), so a capped list can never read as a complete one. There is no
 * per-section pagination in this version — a deliberate scope call, NOT a
 * technical constraint: the detail route could take a `?apps=` param the same
 * way the master list takes `?page=`. The consequence is real and worth stating
 * plainly — a seeker with 300 applications has 280 of them unreachable from this
 * console. Revisit when a real account exceeds a cap.
 */
export const CANDIDATE_APPLICATIONS_LIMIT = 20;
export const CANDIDATE_SAVED_JOBS_LIMIT = 20;
export const CANDIDATE_SESSIONS_LIMIT = 20;
export const CANDIDATE_ACTIVITY_LIMIT = 20;

// Page clamping and last-page arithmetic are not candidate-specific — they are
// the offset-pagination rules every table in this portal obeys, and they are
// already unit-tested in ../employers/format.test.ts. Re-exported rather than
// copied, the same call lib/otp-sessions/format.ts makes: the job review queue
// keeps a private third copy, and two clamps that disagree is a silently wrong
// ?page on one table and not the other.
export { clampPage, lastPageFor } from '../employers/format';

/**
 * Collapse a search param to a single value.
 *
 * Next's App Router delivers `string | string[] | undefined` — a REPEATED key
 * (`?q=a&q=b`, from a hand-edited URL, a pasted link, or a bookmark that grew a
 * duplicate) arrives as an array. Without this, `normalizeQuery` reached
 * `raw.trim()` on an array and threw `TypeError: raw.trim is not a function`,
 * taking the whole route down — reproduced in the dev server before this guard
 * existed. The sibling `page` param survived the same input only by accident,
 * because `clampPage` funnels through `Number(...)` and `Number(['1','2'])` is
 * `NaN`; it is routed through here too rather than left to that luck.
 *
 * First value wins, mirroring `firstParam` in apps/recruiter's jobs page — the
 * repo's other `?q`-consuming surface, which already guards exactly this.
 */
export function firstParam(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Longest `?q` we act on.
 *
 * `q` is user-controlled and reaches Postgres as a `contains` pattern on an
 * UNINDEXED column, so an unbounded string is an unbounded scan predicate.
 * Truncating rather than rejecting keeps the surface forgiving: a pasted
 * paragraph still searches on its first 100 characters instead of erroring.
 */
const MAX_QUERY_LENGTH = 100;

/**
 * Fold the raw `?q` into the one canonical shape the rest of the feature uses.
 *
 * Returning `undefined` (not `''`) for a blank query is what makes `?q=` and a
 * missing `q` the SAME state — so the where-clause branch, the empty-state copy
 * and the href builder can all be a simple truthiness check, and an empty search
 * box can never produce a URL that differs from a fresh page load.
 *
 * Internal whitespace is collapsed so "priya   sharma" matches a row stored as
 * "priya sharma"; Postgres `contains` is a literal substring match and would
 * otherwise miss it.
 */
export function normalizeQuery(raw: string | undefined): string | undefined {
  if (raw == null) return undefined;
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  if (collapsed === '') return undefined;
  return collapsed.slice(0, MAX_QUERY_LENGTH);
}

/**
 * Shared by the pagination links and the over-range redirect, so the two can
 * never build different URLs for the same state.
 *
 * Params are emitted in a FIXED order (`q` then `page`) for that reason, and the
 * default page is omitted to keep the canonical URL clean. The active search
 * MUST be carried through — dropping it would silently clear the filter when an
 * admin pages through results.
 *
 * basePath-relative: Next adds '/sadmin' itself.
 */
export function candidatesHref(page: number, q?: string): string {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/candidates?${qs}` : '/candidates';
}

/**
 * Link from a master-list row to that candidate's detail page, carrying the
 * list state the admin is currently looking at.
 *
 * The `q`/`page` round-trip is what lets the detail page's Back link return to
 * the exact filtered page the admin left, instead of dumping them on an
 * unfiltered page 1 after every single View. It deliberately carries the two
 * PARAMS rather than a `?from=` URL: a free-form return URL taken off the query
 * string is an open-redirect surface that would then need its own validation,
 * whereas `q` and `page` are re-encoded here and decoded on the far side by the
 * very same `normalizeQuery` / `clampPage` this file already exports — so the
 * two ends cannot disagree about what a given state means, and nothing
 * attacker-controlled reaches a `redirect()`.
 *
 * Param order is fixed (`q` then `page`) and the default page omitted, matching
 * `candidatesHref` above. basePath-relative: Next adds '/sadmin' itself.
 */
export function candidateDetailHref(id: number, page: number, q?: string): string {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/candidates/${id}?${qs}` : `/candidates/${id}`;
}

/**
 * What this person does, as one line.
 *
 * `headline` is the seeker's own self-description and wins when set;
 * `currentTitle` is the more mechanical fallback. Both are nullable AND the
 * whole `Candidate` row may be absent, so all three misses land on an em dash.
 * Encoded once here so no caller re-derives the precedence.
 */
export function formatHeadline(
  candidate: { headline: string | null; currentTitle: string | null } | null,
): string {
  if (!candidate) return '—';
  return candidate.headline?.trim() || candidate.currentTitle?.trim() || '—';
}

/**
 * Monogram for the avatar: first + last word of the display name.
 *
 * Lifted verbatim from the private copy in app/(authed)/layout.tsx so it is
 * actually reachable by a test. Six inline copies of this already exist across
 * the repo — a seventh is the duplicate-`Accordion` smell, so callers on this
 * surface import this one.
 *
 * Takes the DISPLAY name, not `User.name`: a blank name falls back to the email
 * upstream, and initialling the email is better than rendering '?'.
 */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

// ---------------------------------------------------------------------------
// Enum labels for the candidate detail page.
//
// EVERY table below is `Record<PrismaEnum, string>`, never
// `Record<string, string>`. The reason is written out at EMPLOYMENT_LABEL in
// ../jobs/format.ts and is not theoretical: as a widened record that map
// invented CONTRACT and TEMPORARY (neither exists) while omitting the real
// CONTRACTOR, which then fell through to a raw-enum fallback and rendered
// "CONTRACTOR" to a reviewer. Keyed by the enum, a missing OR invented member is
// a compile error, so these cannot drift from the schema.
// ---------------------------------------------------------------------------

// The FOURTH copy of this map in the repo — apps/web's StatusPill and
// apps/recruiter's ApplicantsTable and ApplicantDrawer each carry their own, and
// none is exported from a shared package. Copied rather than imported because
// tsconfig.base.json has no path alias reaching `apps/`, so sadmin structurally
// cannot import from another app. Labels match those three verbatim, so one
// application reads identically wherever staff look at it.
const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  APPLIED: 'Applied',
  IN_REVIEW: 'In review',
  SHORTLISTED: 'Shortlisted',
  INTERVIEWED: 'Interviewed',
  OFFERED: 'Offered',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};

export function formatApplicationStatus(status: ApplicationStatus): string {
  return APPLICATION_STATUS_LABEL[status];
}

// The state of the JOB a candidate applied to or saved — not the application.
// Both matter on this page: a saved job that has since EXPIRED explains why the
// seeker never applied, and CLOSED explains a stalled application.
const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  DRAFT: 'Draft',
  PENDING_MODERATION: 'Under review',
  ACTIVE: 'Live',
  EXPIRED: 'Expired',
  CLOSED: 'Closed',
};

export function formatJobStatus(status: JobStatus): string {
  return JOB_STATUS_LABEL[status];
}

// 'Experienced', not 'Working'. apps/web disagrees with ITSELF here: the
// onboarding step (components/onboarding/EmploymentStep.tsx) already labels the
// member 'Experienced', while the profile editor
// (components/profile/ProfileForm.tsx) labels the same member 'Working'. This
// console follows the enum, which is also what onboarding does — so ProfileForm
// is the outlier, and it is the surface to change if the two are ever
// reconciled.
const WORK_STATUS_LABEL: Record<WorkStatus, string> = {
  FRESHER: 'Fresher',
  EXPERIENCED: 'Experienced',
};

export function formatWorkStatus(value: WorkStatus | null): string {
  return value == null ? '—' : WORK_STATUS_LABEL[value];
}

const LOOKING_FOR_LABEL: Record<LookingFor, string> = {
  JOB: 'Job',
  INTERNSHIP: 'Internship',
  BOTH: 'Job or internship',
};

export function formatLookingFor(value: LookingFor | null): string {
  return value == null ? '—' : LOOKING_FOR_LABEL[value];
}

const GENDER_LABEL: Record<Gender, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  PREFER_NOT_TO_SAY: 'Prefer not to say',
};

export function formatGender(value: Gender | null): string {
  return value == null ? '—' : GENDER_LABEL[value];
}

const LANGUAGE_PROFICIENCY_LABEL: Record<LanguageProficiency, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  ADVANCED: 'Advanced',
};

export function formatLanguageProficiency(value: LanguageProficiency): string {
  return LANGUAGE_PROFICIENCY_LABEL[value];
}

// PENDING is the DEFAULT on Resume.scanStatus, so it is the common state rather
// than an anomaly — worded as a fact about the scan, not as a warning.
const SCAN_STATUS_LABEL: Record<ResumeScanStatus, string> = {
  PENDING: 'Scan pending',
  CLEAN: 'Scanned clean',
  INFECTED: 'Malware detected',
};

export function formatScanStatus(value: ResumeScanStatus): string {
  return SCAN_STATUS_LABEL[value];
}

// Every member of ProfileAuditAction, including the many a CANDIDATE can never
// produce (the recruiter, KYC, billing, moderation and support actions all write
// the ACTING staff member's or recruiter's User id, so they cannot appear under
// a seeker). They are here because the record must be exhaustive to compile, and
// an exhaustive map is the cheapest possible guarantee that a new enum member
// shows up as a build failure rather than as a raw SCREAMING_SNAKE string in
// front of staff.
const PROFILE_AUDIT_ACTION_LABEL: Record<ProfileAuditAction, string> = {
  PROFILE_UPDATE: 'Updated profile',
  EDUCATION_ADD: 'Added education',
  EDUCATION_UPDATE: 'Updated education',
  EDUCATION_DELETE: 'Removed education',
  EXPERIENCE_ADD: 'Added work experience',
  EXPERIENCE_UPDATE: 'Updated work experience',
  EXPERIENCE_DELETE: 'Removed work experience',
  SKILLS_UPDATE: 'Updated skills',
  RESUME_UPLOAD: 'Uploaded a CV',
  RESUME_DELETE: 'Removed a CV',
  RECRUITER_PROFILE_UPDATE: 'Updated recruiter profile',
  COMPANY_UPDATE: 'Updated company',
  COMPANY_LOGO_UPDATE: 'Updated company logo',
  KYC_SUBMITTED: 'Submitted business verification',
  KYC_DOCUMENT_UPLOAD: 'Uploaded a verification document',
  KYC_DOCUMENT_DELETE: 'Removed a verification document',
  KYC_APPROVED: 'Approved business verification',
  KYC_REJECTED: 'Rejected business verification',
  JOB_APPROVED: 'Approved a job posting',
  JOB_REJECTED: 'Sent a job posting back',
  RECRUITER_PASSWORD_CHANGE: 'Changed password',
  RECRUITER_USER_INVITED: 'Invited a team member',
  RECRUITER_INVITE_REVOKED: 'Revoked an invite',
  RECRUITER_INVITE_ACCEPTED: 'Accepted an invite',
  RECRUITER_USER_ROLE_CHANGED: 'Changed a team member role',
  RECRUITER_USER_PERMISSIONS_CHANGED: 'Changed team member permissions',
  RECRUITER_USER_REMOVED: 'Removed a team member',
  BILLING_PROFILE_UPDATE: 'Updated billing profile',
  BILLING_ORDER_CREATED: 'Created a payment order',
  BILLING_SUBSCRIPTION_ACTIVATED: 'Activated a subscription',
  BILLING_PAYMENT_FAILED: 'Payment failed',
  SUPPORT_TICKET_STATUS_CHANGED: 'Changed a support ticket status',
  OTP_CODE_REVEALED: 'Revealed a signup OTP',
};

export function formatProfileAuditAction(action: ProfileAuditAction): string {
  return PROFILE_AUDIT_ACTION_LABEL[action];
}

const AUTH_PROVIDER_LABEL: Record<AuthProvider, string> = {
  LOCAL: 'Email and password',
  GOOGLE: 'Google',
  APPLE: 'Apple',
};

/**
 * How this account signs in.
 *
 * `provider` records only the SIGNUP method, but an account can carry a linked
 * Google AND Apple identity — someone who signed up on the web and later used
 * their phone lands on the same row (see User.appleId's schema comment) — which
 * `provider` alone does not reveal.
 *
 * Keyed off AUTH_PROVIDER_LABEL rather than branched, and living here rather
 * than in the page, for the reason stated at the top of this section: an earlier
 * version of this function was a ternary chain ending in a bare `: 'Apple'`, so
 * adding a fourth AuthProvider member (the enum's own comment anticipates more
 * social logins) would have typechecked cleanly and then told a super admin that
 * every LinkedIn signup authenticates through Apple. A keyed Record cannot
 * compile wrong, and code in app/ is never executed by the test suite.
 */
export function formatSignInMethod(account: {
  provider: AuthProvider;
  hasGoogleLinked: boolean;
  hasAppleLinked: boolean;
}): string {
  const base = AUTH_PROVIDER_LABEL[account.provider];
  const alsoLinked: string[] = [];
  if (account.hasGoogleLinked && account.provider !== 'GOOGLE') {
    alsoLinked.push(AUTH_PROVIDER_LABEL.GOOGLE);
  }
  if (account.hasAppleLinked && account.provider !== 'APPLE') {
    alsoLinked.push(AUTH_PROVIDER_LABEL.APPLE);
  }
  return alsoLinked.length === 0 ? base : `${base} (also linked: ${alsoLinked.join(', ')})`;
}

// ---------------------------------------------------------------------------
// Value formatting
// ---------------------------------------------------------------------------

/**
 * A free-text profile value, or the em dash this console uses for "not set".
 *
 * `?? '—'` is NOT enough and that is the whole point of this function: the
 * profile DTOs declare these columns as `z.string().max(N).optional()` with no
 * `.trim()` and no `.min(1)`, so a seeker who types a single space into a
 * profile field stores `' '` — a value that is neither null nor visible. Left to
 * `??`, the detail page renders a labelled row with nothing beside it while the
 * master list (which routes headline through `formatHeadline`, and has trimmed
 * since it shipped) shows the em dash. Two staff screens then disagree about the
 * same account, and the blank reads as a rendering fault rather than as absence.
 */
export function orDash(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : '—';
}

/**
 * True when there is real text to render, as opposed to a blank the seeker
 * stored by typing whitespace. Guards the optional free-text CARDS, which must
 * not mount at all for an empty value — `{profile.summary && <Card/>}` is truthy
 * for `'   '` and would render an About card containing nothing.
 */
export function hasText(value: string | null | undefined): boolean {
  return (value?.trim().length ?? 0) > 0;
}

/**
 * The CVs that exist but are not listed.
 *
 * ⚠ These are NOT all deletions, which is why the wording avoids that word.
 * `ResumeService.upload` soft-deletes the previous active resume inside the
 * upload transaction, so simply replacing a CV stamps `deletedAt` on the old row
 * without the candidate deleting anything. Calling the bucket "deleted CVs"
 * therefore reports withdrawals that never happened — and since every prior
 * upload lands here, it is the common case rather than the exception.
 */
export function formatHiddenResumes(count: number): string | null {
  if (count <= 0) return null;
  return count === 1
    ? '1 older or removed CV is not shown.'
    : `${count.toLocaleString('en-IN')} older or removed CVs are not shown.`;
}

/**
 * Total experience, stored in MONTHS for sub-year precision (SRS §4.3.1) and
 * shown in years.
 *
 * A separate function from ../jobs/format's `formatExperience`, which takes
 * (minYears, maxYears) and describes a job's REQUIREMENT BAND. Passing a single
 * month count into that one would render a range.
 */
export function formatExperienceMonths(months: number | null): string {
  if (months == null || !Number.isFinite(months) || months < 0) return '—';
  if (months === 0) return 'No experience yet';
  const years = Math.round((months / 12) * 10) / 10;
  return years === 1 ? '1 yr' : `${years} yrs`;
}

/**
 * ONE salary figure in lakhs per annum, from a paise integer.
 *
 * Separate from `formatSalaryLpa(min, max)` on purpose, and this is a real trap
 * rather than a stylistic split: that function's one-sided branch renders a
 * lone minimum as "₹12+ LPA", so passing a candidate's exact current salary
 * through it would tell staff the person earns AT LEAST a figure that is in fact
 * their precise salary. The paise→LPA arithmetic below is deliberately identical
 * to it (divide by 10,000,000, one decimal, drop a trailing ".0") so the two
 * surfaces round the same number the same way — and, like it, there is no crore
 * branch, so a candidate salary and a job salary always read in the same unit.
 */
export function formatCurrentSalary(paise: number | null): string {
  if (paise == null || !Number.isFinite(paise)) return '—';
  const lpa = Math.round((paise / 10_000_000) * 10) / 10;
  return `₹${lpa} LPA`;
}

// The canonical option set the seeker actually picks from, mirrored from
// apps/web's onboarding EmploymentStep. Anything off that scale (an older row,
// or a value written before the options settled) falls back to a literal day
// count rather than being rounded into a bucket it was not chosen from.
const NOTICE_PERIOD_LABEL: Record<number, string> = {
  0: 'Immediate',
  15: '15 days',
  30: '1 month',
  60: '2 months',
  90: '3 months',
  120: 'More than 3 months',
};

export function formatNoticePeriod(days: number | null): string {
  if (days == null || !Number.isFinite(days) || days < 0) return '—';
  return NOTICE_PERIOD_LABEL[days] ?? (days === 1 ? '1 day' : `${days} days`);
}

/** File size for the CV list. Mirrors apps/web's ResumeManager. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round((bytes / 1024) * 10) / 10} KB`;
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

/**
 * Education period. `startYear`/`endYear` are Int columns — YEARS, not dates —
 * so this must not go anywhere near a date formatter.
 */
export function formatEducationYears(startYear: number, endYear: number | null): string {
  return endYear == null ? `${startYear} – present` : `${startYear} – ${endYear}`;
}

/**
 * What a session row currently is.
 *
 * ⚠ 'Ended' is deliberately vague, and that is the honest answer rather than a
 * hedge. `Session.revokedAt` is stamped BOTH by an explicit sign-out AND by
 * every refresh-token rotation (auth.service.ts `refresh()` revokes the old row
 * and inserts a new one), and nothing in the row distinguishes the two. Calling
 * it "Signed out" would therefore report a deliberate act for what is almost
 * always a routine 15-minute token rotation.
 *
 * Takes `now` rather than reading the clock, so the whole render agrees and the
 * test is deterministic.
 */
export function formatSessionState(
  session: { revokedAt: Date | null; expiresAt: Date },
  now: Date,
): 'Active' | 'Ended' | 'Expired' {
  if (session.revokedAt !== null) return 'Ended';
  return session.expiresAt.getTime() > now.getTime() ? 'Active' : 'Expired';
}

/**
 * Whether a work-experience row is still running.
 *
 * The two columns can disagree — `isCurrent` is a checkbox the seeker ticks and
 * `endDate` is nullable — so the precedence is fixed here rather than left to
 * whichever the caller happened to read. Either signal means ongoing: a ticked
 * "I work here" with a stale end date is still a claim to be working there, and
 * printing a past end date beside it would contradict the seeker's own answer.
 */
export function isOngoingExperience(exp: { endDate: Date | null; isCurrent: boolean }): boolean {
  return exp.isCurrent || exp.endDate === null;
}

/**
 * "Latest 20 of 137" — or nothing at all when the section is not truncated.
 *
 * Returning null below the cap is what keeps a complete list from being labelled
 * as if something were hidden. Every capped section on the detail page routes
 * through here so none of them can silently look complete.
 */
export function formatSectionCap(shown: number, total: number, noun: string): string | null {
  if (total <= shown) return null;
  return `Showing the latest ${shown.toLocaleString('en-IN')} of ${total.toLocaleString(
    'en-IN',
  )} ${noun}.`;
}
