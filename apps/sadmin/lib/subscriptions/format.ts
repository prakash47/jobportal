// Pure logic for the Subscriptions & Billing console — state derivation, tabs,
// labels, money and URL building. No JSX, no Prisma, and no `new Date()`:
// anything that needs "now" takes it as an argument, so the tests are
// deterministic. Same discipline as lib/job-postings/format.ts.

import type { SubscriptionStatus, SubscriptionTier } from '@jobportal/db';

/** Subscriptions per page. Matches every other table in this portal. */
export const SUBSCRIPTIONS_PAGE_SIZE = 20;

// The offset-pagination and `?q` rules every table in this portal obeys,
// re-exported rather than copied for the reason lib/job-postings/format.ts spells
// out: two clamps that disagree is a silently wrong ?page on one table and not
// the other, and a repeated `?q=a&q=b` reaching `raw.trim()` on an array is a
// real 500 this repo has already taken.
export { clampPage, lastPageFor } from '../employers/format';
export { firstParam, normalizeQuery } from '../candidates/format';

// LIKE-wildcard escaping, re-exported from the job-postings console that
// introduced it. Without it `?q=%` matches every company on the platform — the
// exact behaviour PROGRESS.md's 2026-08-14 follow-up (1) records as still
// outstanding on /sadmin/candidates. A third copy would be a third chance to get
// the backslash ordering wrong.
export { escapeLikePattern } from '../job-postings/format';

/**
 * The lifecycle state this console displays — DERIVED, never the raw
 * `Subscription.status` column.
 *
 * ⚠ This is the single most important function in this module. Reading `status`
 * straight off the row would LIE, because **nothing in this product ever writes
 * `SubscriptionStatus.EXPIRED`** — there is no cron, no BullMQ processor and no
 * request path that ages a subscription out. A plan whose period ended six
 * months ago still reads ACTIVE in the database forever.
 *
 * Every consumer that actually grants access already knows this and re-checks
 * the date itself: `resolveRecruiterTier` requires `status IN (ACTIVE, TRIALING)`
 * **AND** `currentPeriodEnd > now`. This console must agree with that resolver,
 * or staff would read "Active" on a row that grants nothing.
 *
 * PAST_DUE and EXPIRED both fall under LAPSED rather than getting their own
 * states: neither is written by any code path today, so a tab for either would
 * be permanently empty, and both mean the same thing to a staff member — the
 * plan is not granting access.
 */
export type SubscriptionState = 'ACTIVE' | 'LAPSED' | 'CANCELLED';

export function deriveSubscriptionState(
  status: SubscriptionStatus,
  currentPeriodEnd: Date,
  now: Date,
): SubscriptionState {
  if (status === 'CANCELLED') return 'CANCELLED';
  if (status !== 'ACTIVE' && status !== 'TRIALING') return 'LAPSED';
  return currentPeriodEnd.getTime() > now.getTime() ? 'ACTIVE' : 'LAPSED';
}

/**
 * Labels for the derived state.
 *
 * `Record<SubscriptionState, string>`, never `Record<string, string>` — a
 * widened record invents members that do not exist while omitting real ones,
 * which then renders raw SCREAMING_SNAKE to staff. Keyed by the union, a missing
 * or invented member is a compile error.
 */
export const SUBSCRIPTION_STATE_LABEL: Record<SubscriptionState, string> = {
  ACTIVE: 'Active',
  LAPSED: 'Lapsed',
  CANCELLED: 'Cancelled',
};

/** Tier labels. Keyed by the enum for the same reason as the state labels. */
export const SUBSCRIPTION_TIER_LABEL: Record<SubscriptionTier, string> = {
  FREE: 'Free',
  BASIC: 'Basic',
  PREMIUM: 'Premium',
  ENTERPRISE: 'Enterprise',
};

/**
 * The tabs, in render order.
 *
 * ACTIVE is first and is the default: the question this console is opened to
 * answer is "who is on a paid plan right now". ALL is last — the escape hatch,
 * not the starting point.
 *
 * A readonly TUPLE rather than a Record, and that is load-bearing: parseSubscriptionTab
 * validates by MEMBERSHIP against this array, never by indexing an object with
 * the raw param. `?status=__proto__` indexing a plain object returns a truthy
 * inherited value and would sail through a `if (MAP[raw])` check — the exact
 * prototype-chain class of bug this repo already shipped a HIGH for on the SRP.
 */
export const SUBSCRIPTION_TABS = ['ACTIVE', 'LAPSED', 'CANCELLED', 'ALL'] as const;
export type SubscriptionTab = (typeof SUBSCRIPTION_TABS)[number];

/** The tab shown when `?status` is absent, unknown, or malformed. */
export const DEFAULT_SUBSCRIPTION_TAB: SubscriptionTab = 'ACTIVE';

export const SUBSCRIPTION_TAB_LABEL: Record<SubscriptionTab, string> = {
  ACTIVE: 'Active',
  LAPSED: 'Lapsed',
  CANCELLED: 'Cancelled',
  ALL: 'All',
};

export function parseSubscriptionTab(raw: string | string[] | undefined): SubscriptionTab {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== 'string') return DEFAULT_SUBSCRIPTION_TAB;
  const upper = first.trim().toUpperCase();
  // Membership against the tuple — never `SOME_MAP[upper]`. See SUBSCRIPTION_TABS.
  return (SUBSCRIPTION_TABS as readonly string[]).includes(upper)
    ? (upper as SubscriptionTab)
    : DEFAULT_SUBSCRIPTION_TAB;
}

/**
 * Shared by the status tabs, the pagination links AND the over-range redirect,
 * so no two of them can build different URLs for the same state. Every known
 * param is carried through in a FIXED order (status, q, page) with defaults
 * omitted, so `/subscriptions` and `/subscriptions?status=ACTIVE&page=1` are the
 * same view and the same URL.
 *
 * basePath-relative: Next adds '/sadmin' itself. Writing '/sadmin/subscriptions'
 * here would resolve to /sadmin/sadmin/subscriptions.
 */
export function subscriptionsHref(tab: SubscriptionTab, page: number, q?: string): string {
  const params = new URLSearchParams();
  if (tab !== DEFAULT_SUBSCRIPTION_TAB) params.set('status', tab);
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/subscriptions?${qs}` : '/subscriptions';
}

/**
 * Link from a row to that subscription's detail page, carrying the list state so
 * Back returns to the exact filtered page the admin left rather than dumping
 * them on an unfiltered page 1 after every View. Carries the three typed params
 * rather than a free-form `?from=` URL, which would be an open-redirect surface.
 */
export function subscriptionDetailHref(
  id: number,
  tab: SubscriptionTab,
  page: number,
  q?: string,
): string {
  const params = new URLSearchParams();
  if (tab !== DEFAULT_SUBSCRIPTION_TAB) params.set('status', tab);
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/subscriptions/${id}?${qs}` : `/subscriptions/${id}`;
}

/**
 * Whether this subscription was comped by staff rather than bought.
 *
 * The console's entire write permission hangs off this: per the owner's
 * 2026-08-15 ruling staff cannot override billing, so a gateway-paid
 * subscription is view-only here and the API refuses to mutate it (409). The UI
 * must agree with that refusal or it would offer buttons that always fail.
 *
 * ⚠ UX only. `AdminBillingService.update` re-checks `grantedAt` server-side and
 * is the actual boundary — CLAUDE.md §4, UI gating is never the enforcement.
 */
export function isAdminGranted(grantedAt: Date | null): boolean {
  return grantedAt !== null;
}

/**
 * Rupees from a paise integer, for display.
 *
 * Every money column in this schema is an integer count of paise
 * (`priceInPaise`, `amountInPaise`, `taxableInPaise`), so this divides by 100
 * rather than trusting a float anywhere. `Intl` renders the Indian digit
 * grouping (₹99,999 not ₹99,999.00 when whole), which is what a rupee amount
 * looks like to the staff reading it.
 *
 * ⚠ This is a GROSS, GST-INCLUSIVE figure wherever it renders a plan price:
 * apps/api/src/recruiter-billing/gst.ts states that plan prices are
 * GST-inclusive and the invoice back-computes the taxable value from the total.
 * Anything labelled "revenue" must read taxableInPaise instead, or it overstates
 * by 18% — see the note on the deferred Transaction & Revenue Log.
 */
export function formatInrFromPaise(paise: number): string {
  const rupees = paise / 100;
  // A whole amount shows no decimals (₹4,999); a fractional one shows BOTH
  // digits (₹4,999.50, never ₹4,999.5). minimumFractionDigits has to move with
  // the maximum — leaving the minimum at 0 lets Intl trim the trailing zero,
  // which on a money figure reads as a different amount at a glance.
  const fractionDigits = Number.isInteger(rupees) ? 0 : 2;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(rupees);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Days left before the period ends, never negative.
 *
 * ⚠ `Math.ceil`, and that is NOT a free choice: it is copied from the
 * recruiter's own billing card
 * (apps/recruiter/app/(authed)/billing/page.tsx — `Math.max(0, Math.ceil(...))`),
 * which is a shipped surface showing the SAME number to the company whose plan
 * this is. An earlier version of this file used `Math.floor`, which meant a
 * subscription with 30 hours left read "1 day" to the recruiter and "1 day" here
 * only by luck — at 20 hours the two disagreed outright. Two surfaces quoting a
 * different number of days for one subscription is worse than either rounding
 * rule being individually preferable.
 */
export function daysRemaining(end: Date, now: Date): number {
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS));
}

/**
 * WHOLE days that have elapsed since the period ended, never negative.
 *
 * Truncates rather than rounds, because this counts completed days: one
 * millisecond after the end is "0 days ago", not "1 day ago". `Math.floor` on
 * the negative delta rounds AWAY from zero and produced exactly that — a period
 * that ended 1ms ago rendered "Ended 1 days ago", and the display jumped from
 * "Ends today" to "Ended 1 days ago" across a one-millisecond boundary.
 *
 * Separate from daysRemaining rather than one signed helper: the two directions
 * want different rounding (ceil forward, truncate back), and a single function
 * cannot honestly do both.
 */
export function daysSince(end: Date, now: Date): number {
  return Math.max(0, Math.trunc((now.getTime() - end.getTime()) / DAY_MS));
}

/**
 * "1 day" / "2 days". The recruiter's card already pluralises this correctly
 * (`daysLeft === 1 ? 'day' : 'days'`); this console printed "1 days" in both of
 * its call sites until it did too.
 */
export function pluralDays(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

/**
 * The result-count sentence, and the text of the list's live region.
 *
 * Lives here rather than inline in the page so it is unit-testable: this is the
 * sentence a screen-reader user hears when a search narrows the list to nothing,
 * and the search bar commits with `router.replace(..., { scroll: false })` so
 * nothing else announces the change.
 */
export function formatSubscriptionsSummary(
  total: number,
  tab: SubscriptionTab,
  q?: string,
): string {
  const scope = tab === 'ALL' ? '' : ` ${SUBSCRIPTION_TAB_LABEL[tab].toLowerCase()}`;
  const noun = total === 1 ? 'subscription' : 'subscriptions';
  if (total === 0) {
    return q
      ? `No${scope} subscriptions match “${q}”.`
      : `No${scope} subscriptions yet.`;
  }
  const suffix = q ? ` matching “${q}”` : '';
  return `${total.toLocaleString('en-IN')}${scope} ${noun}${suffix}.`;
}

/**
 * How the period date reads in the table.
 *
 * ⚠ "Ends", NOT "Renews", and the distinction is factual rather than stylistic.
 * Nothing in this product auto-renews a subscription: there is no billing cron,
 * no BullMQ processor touching subscriptions, and `razorpaySubscriptionId` is
 * null on every row because the purchase flow uses the Razorpay ORDERS API — a
 * one-off charge — not the Subscriptions API. A "renewal" here is the recruiter
 * choosing to buy again; the recruiter portal's own CTA calls it "Upgrade or
 * renew", an action rather than a schedule.
 *
 * A column headed "Renews 14 Sept" would therefore promise staff that money
 * arrives on a date when nothing whatsoever is scheduled to happen, and imply a
 * lapsed plan is merely between renewals rather than dead. "Ends" is what the
 * date actually is: the instant the entitlement stops.
 */
export function periodLabel(state: SubscriptionState): string {
  if (state === 'ACTIVE') return 'Ends';
  if (state === 'CANCELLED') return 'Cancelled';
  return 'Ended';
}
