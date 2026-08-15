import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { formatDateIst } from '../../../lib/jobs/format';
import {
  SUBSCRIPTION_STATE_LABEL,
  SUBSCRIPTION_TABS,
  SUBSCRIPTION_TAB_LABEL,
  SUBSCRIPTION_TIER_LABEL,
  clampPage,
  deriveSubscriptionState,
  firstParam,
  formatInrFromPaise,
  formatSubscriptionsSummary,
  isAdminGranted,
  lastPageFor,
  normalizeQuery,
  parseSubscriptionTab,
  periodLabel,
  subscriptionDetailHref,
  subscriptionsHref,
  type SubscriptionTab,
} from '../../../lib/subscriptions/format';
import {
  listCompaniesEligibleForComp,
  listGrantablePlans,
  listSubscriptions,
  type SubscriptionListRow,
} from '../../../lib/subscriptions/queries';
import { SubscriptionSearchBar } from '../../../components/subscriptions/SubscriptionSearchBar';
import { CompPlanDialog } from '../../../components/subscriptions/CompPlanDialog';

export const metadata: Metadata = {
  title: 'Subscriptions & Billing — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

// Reads Postgres per request; there is nothing to statically render.
export const dynamic = 'force-dynamic';

// Typed as Next actually delivers it: a REPEATED key (`?q=a&q=b`) arrives as an
// ARRAY, so every param goes through firstParam / parseSubscriptionTab. Typing
// these as bare strings is what let an array reach `raw.trim()` and 500 the
// sibling /candidates route.
interface PageProps {
  searchParams: Promise<{
    status?: string | string[];
    q?: string | string[];
    page?: string | string[];
  }>;
}

export default async function SubscriptionsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const tab = parseSubscriptionTab(sp.status);
  const q = normalizeQuery(firstParam(sp.q));
  const page = clampPage(firstParam(sp.page));

  // ONE `now` for the whole render. The tab filter, the derived state on every
  // row and the days-remaining figure must all agree; a second `new Date()`
  // further down could put a row on the boundary in the query and on the other
  // side of it in the pill.
  const now = new Date();

  const [result, writesKilled, plans, companies] = await Promise.all([
    listSubscriptions(page, tab, now, q),
    // Layer 2 of the flag gate: hide the actions the API would refuse anyway.
    // Deliberately does NOT gate the route — this list is read-only and is the
    // only surface showing who is on which plan and when it renews, which is
    // exactly what staff need while writes are switched off. Layer 3 in
    // AdminBillingService is the enforcement point (CLAUDE.md §4).
    isFlagEnabled('killswitch.admin_subscription_write'),
    listGrantablePlans(),
    listCompaniesEligibleForComp(),
  ]);

  // An over-range ?page must not render the empty state: `total` is non-zero, so
  // "No subscriptions match" would be a lie, and the count, table and pagination
  // all live in the non-empty branch — leaving an admin on a dead end with no
  // control to get back. Redirect to the real last page instead, sharing its
  // href builder with the tabs and the pagination links so the three cannot
  // disagree.
  //
  // ⚠ DO NOT ADD A loading.tsx TO THIS SEGMENT. A loading.tsx opens a Suspense
  // boundary that flushes the shell before this redirect throws, so the response
  // has already committed 200 and Next degrades the server redirect to a
  // client-side one — measured on /employers, and the same file turned [id]'s
  // notFound() into a soft 404. This is why /candidates, /employers, /jobs,
  // /job-postings and /otp-sessions all lack one: a constraint, not an oversight.
  if (page > 1 && result.rows.length === 0 && result.total > 0) {
    const lastPage = lastPageFor(result.total, result.pageSize);
    if (page > lastPage) redirect(subscriptionsHref(tab, lastPage, q));
  }

  const isEmpty = result.rows.length === 0;
  const summary = formatSubscriptionsSummary(result.total, tab, q);

  return (
    <div data-wide className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            Subscriptions &amp; Billing
          </h1>
          <p className="text-sm text-[var(--color-fg-muted)]">
            Every recruiter plan on the platform, with its payment history and renewal date. Staff
            can comp, change, extend or cancel a plan they granted; a plan bought through the
            payment gateway is shown here but can only be changed by the gateway.
          </p>
        </div>
        <CompPlanDialog plans={plans} companies={companies} killed={writesKilled} />
      </header>

      {/* Purchasing is switched off platform-wide, which is WHY this console can
          write at all — a comp is currently the only way any subscription can
          come into existence. Stating it here stops staff reading an empty
          Active tab as a fault. */}
      <PurchaseStateNotice />

      {/* Status tabs. Each link carries the active search, so switching tabs
          narrows rather than resets. */}
      <nav
        aria-label="Filter by status"
        className="flex flex-wrap gap-1 border-b border-[var(--color-border)]"
      >
        {SUBSCRIPTION_TABS.map((t) => {
          const active = t === tab;
          return (
            <Link
              key={t}
              href={subscriptionsHref(t, 1, q)}
              aria-current={active ? 'page' : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
                active
                  ? 'border-[var(--color-primary-600)] font-medium text-[var(--color-fg)]'
                  : 'border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
              }`}
            >
              {SUBSCRIPTION_TAB_LABEL[t]}
            </Link>
          );
        })}
      </nav>

      <SubscriptionSearchBar />

      {/* ONE always-mounted live region carrying the result summary. The search
          bar commits with router.replace(..., { scroll: false }), so results swap
          in place: focus never moves, the pathname and <title> are unchanged, and
          Next's route announcer (which diffs the title) therefore says nothing.
          It must be ONE element that always renders and only changes its TEXT — a
          role="status" that mounts together with its message does not announce. */}
      <p
        role="status"
        className={
          isEmpty
            ? 'rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 text-sm text-[var(--color-fg-muted)]'
            : 'text-sm text-[var(--color-fg-muted)]'
        }
      >
        {summary}
      </p>

      {!isEmpty && (
        <>
          {/* The table scrolls inside its own card rather than the document — the
              app shell locks the viewport (h-screen + overflow-hidden) and scrolls
              each pane independently. */}
          <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Company
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Plan
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    List price
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Source
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Period
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Invoices
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {result.rows.map((row) => (
                  <SubscriptionRow
                    key={row.id}
                    row={row}
                    now={now}
                    tab={tab}
                    page={result.page}
                    q={q}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <Pagination tab={tab} page={result.page} total={result.total} pageSize={result.pageSize} q={q} />
        </>
      )}
    </div>
  );
}

// Reads the master purchase switch rather than hardcoding "billing is off": the
// sentence has to stay true the day someone turns it on.
async function PurchaseStateNotice() {
  const purchasingOn = await isFlagEnabled('subscription.system.enabled');
  if (purchasingOn) return null;
  return (
    <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-4 py-3 text-sm text-[var(--color-fg-muted)]">
      Recruiters cannot currently buy a plan — <code>subscription.system.enabled</code> is off, so
      the storefront is closed. A comp granted here is the only way a subscription can exist, and it
      takes effect immediately.
    </p>
  );
}

function SubscriptionRow({
  row,
  now,
  tab,
  page,
  q,
}: {
  row: SubscriptionListRow;
  now: Date;
  tab: SubscriptionTab;
  page: number;
  q: string | undefined;
}) {
  // Derived, never the raw status column — nothing in this product writes
  // SubscriptionStatus.EXPIRED, so a lapsed row still reads ACTIVE forever. See
  // deriveSubscriptionState.
  const state = deriveSubscriptionState(row.status, row.currentPeriodEnd, now);
  const granted = isAdminGranted(row.grantedAt);

  return (
    <tr className="hover:bg-[var(--color-bg-muted)]">
      {/* company is a nullable relation on the row shape; the query scopes to
          non-null companyId, so this is defensive rather than expected. */}
      <td className="px-4 py-3 font-medium text-[var(--color-fg)]">{row.company?.name ?? '—'}</td>

      <td className="px-4 py-3 text-[var(--color-fg-muted)]">
        <span className="block text-[var(--color-fg)]">{row.plan.name}</span>
        <span className="mt-0.5 block text-xs">{SUBSCRIPTION_TIER_LABEL[row.plan.tier]}</span>
      </td>

      {/* Right-aligned with the header because it is a quantity; tabular figures
          stop the column jittering between rows. Labelled "List price", not
          "Paid": this is the plan's sticker price, and for a comped row nobody
          paid it. What was actually charged lives on the invoice. */}
      <td className="px-4 py-3 text-right tabular-nums text-[var(--color-fg-muted)]">
        {formatInrFromPaise(row.plan.priceInPaise)}
      </td>

      <td className="px-4 py-3">
        <StatePill state={state} />
      </td>

      <td className="px-4 py-3 text-[var(--color-fg-muted)]">{granted ? 'Comped' : 'Paid'}</td>

      <td className="px-4 py-3 text-[var(--color-fg-muted)]">
        {/* The label moves with the state, and says "Ends" rather than
            "Renews": nothing in this product auto-renews. See periodLabel. */}
        <span className="block text-xs uppercase tracking-wide">{periodLabel(state)}</span>
        <span className="block text-[var(--color-fg)]">{formatDateIst(row.currentPeriodEnd)}</span>
      </td>

      <td className="px-4 py-3 text-right tabular-nums text-[var(--color-fg-muted)]">
        {row.invoiceCount.toLocaleString('en-IN')}
      </td>

      <td className="px-4 py-3">
        {/* Self-describing out of context: twenty links all named "View" is what
            a screen-reader user hears when listing this page's controls. The
            visible word stays FIRST so voice control still matches "click View"
            (WCAG 2.5.3 Label in Name). */}
        <Link
          href={subscriptionDetailHref(row.id, tab, page, q)}
          className="rounded font-medium text-[var(--color-primary-700)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        >
          View
          <span className="sr-only"> details for {row.company?.name ?? 'this company'}</span>
        </Link>
      </td>
    </tr>
  );
}

// A neutral pill. Three colours across a dense table is noise, and this console's
// palette rule is monochrome plus one accent (CLAUDE.md §2); Lapsed and Cancelled
// are ordinary states rather than problems, so painting them amber or red would
// invent an alarm.
//
// Active is distinguished by WEIGHT AND FOREGROUND, not hue — the same fix the
// job-postings pill took after --color-success on --color-bg-muted measured
// 2.76:1, below the 4.5:1 AA floor for 12px text.
function StatePill({ state }: { state: ReturnType<typeof deriveSubscriptionState> }) {
  const live = state === 'ACTIVE';
  return (
    <span
      className={`inline-block rounded-md bg-[var(--color-bg-muted)] px-2 py-1 text-xs ${
        live ? 'font-medium text-[var(--color-fg)]' : 'text-[var(--color-fg-muted)]'
      }`}
    >
      {SUBSCRIPTION_STATE_LABEL[state]}
    </span>
  );
}

function Pagination({
  tab,
  page,
  total,
  pageSize,
  q,
}: {
  tab: SubscriptionTab;
  page: number;
  total: number;
  pageSize: number;
  q: string | undefined;
}) {
  const lastPage = lastPageFor(total, pageSize);
  if (lastPage === 1) return null;

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
      <span className="text-sm text-[var(--color-fg-muted)]">
        Page {page} of {lastPage}
      </span>
      <span className="flex gap-2">
        {page > 1 && (
          <Link
            href={subscriptionsHref(tab, page - 1, q)}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]"
          >
            Previous
          </Link>
        )}
        {page < lastPage && (
          <Link
            href={subscriptionsHref(tab, page + 1, q)}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]"
          >
            Next
          </Link>
        )}
      </span>
    </nav>
  );
}
