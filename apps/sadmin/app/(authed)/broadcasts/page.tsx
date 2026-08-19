import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FLAG, isFlagEnabled } from '@jobportal/feature-flags';
import { formatDateIst } from '../../../lib/jobs/format';
import {
  BROADCAST_TABS,
  BROADCAST_TAB_LABEL,
  broadcastDetailHref,
  broadcastsHref,
  clampPage,
  firstParam,
  formatBroadcastSegment,
  formatBroadcastStatus,
  formatBroadcastsSummary,
  formatChannels,
  formatCount,
  formatDeliverySummary,
  isInFlight,
  lastPageFor,
  newBroadcastHref,
  normalizeQuery,
  parseBroadcastTab,
  type BroadcastTab,
} from '../../../lib/broadcasts/format';
import { listBroadcasts, pageSizeOf } from '../../../lib/broadcasts/queries';
import type { BroadcastListItem } from '../../../lib/broadcasts/types';
import { BroadcastSearchBar } from '../../../components/broadcasts/BroadcastSearchBar';

export const metadata: Metadata = {
  title: 'Broadcast Notifications — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

// Reads the API per request; there is nothing to statically render.
export const dynamic = 'force-dynamic';

// Typed as Next actually delivers it, not as we wish it were: a REPEATED key
// (`?q=a&q=b`) arrives as an ARRAY, so all three params go through firstParam /
// parseBroadcastTab. Typing these as bare strings is what let an array reach
// `raw.trim()` and 500 the /candidates route.
interface PageProps {
  searchParams: Promise<{
    status?: string | string[];
    q?: string | string[];
    page?: string | string[];
  }>;
}

export default async function BroadcastsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const tab = parseBroadcastTab(sp.status);
  const q = normalizeQuery(firstParam(sp.q));
  const page = clampPage(firstParam(sp.page));

  // Layer 2 for the killswitch, and READ-ONLY here: the flag gates DISPATCH, not
  // this console. There is deliberately no Layer 1 middleware gate — 404ing this
  // route in order to stop a send would take down the only surface that can see
  // what has already gone out, which is exactly what staff need during whatever
  // incident made someone reach for the switch. Same shape
  // killswitch.admin_transaction_export and killswitch.admin_job_delete use.
  const [result, killed] = await Promise.all([
    listBroadcasts(tab, page, q),
    isFlagEnabled(FLAG.KILL_ADMIN_BROADCAST_SEND),
  ]);

  if (!result.ok) {
    return (
      <div data-wide className="space-y-6">
        <Header killed={killed} />
        {/* Names what actually failed. The API being unreachable and a genuinely
            empty log look identical if both render "no broadcasts", and staff
            would conclude nothing had ever been sent. */}
        <p
          role="alert"
          className="rounded-lg border border-[var(--color-danger)] bg-[var(--color-bg-elevated)] p-6 text-sm text-[var(--color-fg)]"
        >
          {result.message}
        </p>
      </div>
    );
  }

  const data = result.data;
  const pageSize = pageSizeOf(data);

  // An over-range ?page must not render the empty state: `total` is non-zero, so
  // "No broadcasts yet" would be a lie, and the count, table and pagination all
  // live in the non-empty branch — leaving staff on a dead end with no control
  // to get back.
  //
  // ⚠ DO NOT ADD A loading.tsx TO THIS SEGMENT. A loading.tsx opens a Suspense
  // boundary that flushes the shell before this redirect throws, so the response
  // has already committed 200 and Next degrades the server redirect to a
  // client-side one — measured on /employers, and the same file turned [id]'s
  // notFound() into a soft 404.
  if (page > 1 && data.items.length === 0 && data.total > 0) {
    const lastPage = lastPageFor(data.total, pageSize);
    if (page > lastPage) redirect(broadcastsHref(tab, lastPage, q));
  }

  const isEmpty = data.items.length === 0;

  return (
    <div data-wide className="space-y-6">
      <Header killed={killed} />

      {/* Status tabs. Each link carries the active search, so switching tabs
          narrows rather than resets. */}
      <nav
        aria-label="Filter by status"
        className="flex flex-wrap gap-1 border-b border-[var(--color-border)]"
      >
        {BROADCAST_TABS.map((t) => {
          const active = t === tab;
          return (
            <Link
              key={t}
              href={broadcastsHref(t, 1, q)}
              aria-current={active ? 'page' : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
                active
                  ? 'border-[var(--color-primary-600)] font-medium text-[var(--color-fg)]'
                  : 'border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
              }`}
            >
              {BROADCAST_TAB_LABEL[t]}
            </Link>
          );
        })}
      </nav>

      <BroadcastSearchBar />

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
        {formatBroadcastsSummary(data.total, tab, q)}
      </p>

      {!isEmpty && (
        <>
          {/* The table scrolls inside its own card rather than the document —
              the app shell locks the viewport (h-screen + overflow-hidden) and
              scrolls each pane independently. */}
          <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Subject
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Sent to
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Channels
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Delivery
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Created
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {data.items.map((item) => (
                  <BroadcastRow key={item.id} item={item} tab={tab} page={data.page} q={q} />
                ))}
              </tbody>
            </table>
          </div>

          <Pagination tab={tab} page={data.page} total={data.total} pageSize={pageSize} q={q} />
        </>
      )}
    </div>
  );
}

function Header({ killed }: { killed: boolean }) {
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            Broadcast Notifications
          </h1>
          {/* Says "recruiters" for the in-app half rather than "users", because
              that is the truth: apps/web has no notification centre, so an
              in-app announcement addressed to job seekers would render nowhere.
              Stating it here means nobody has to discover it by sending one. */}
          <p className="text-sm text-[var(--color-fg-muted)]">
            Platform-wide announcements — maintenance windows, policy changes, service notices.
            Email reaches everyone in the segment; in-app notifications reach recruiters only.
          </p>
        </div>
        <Link
          href={newBroadcastHref()}
          className="rounded-md bg-[var(--color-primary-600)] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-700)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2"
        >
          New broadcast
        </Link>
      </header>

      {killed && (
        // Surfaced on the LOG as well as on the detail page, because the moment
        // it matters most is before someone spends ten minutes writing a notice
        // they cannot send.
        <p className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-muted)] px-4 py-3 text-sm text-[var(--color-fg)]">
          Sending is currently switched off by a killswitch. Broadcasts can still be composed,
          edited and test-sent; the Send control is disabled until it is switched back on.
        </p>
      )}
    </div>
  );
}

function BroadcastRow({
  item,
  tab,
  page,
  q,
}: {
  item: BroadcastListItem;
  tab: BroadcastTab;
  page: number;
  q: string | undefined;
}) {
  return (
    <tr className="hover:bg-[var(--color-bg-muted)]">
      {/* Admin-authored free text shown to staff: plain text, never markup. */}
      <td className="px-4 py-3">
        <span className="block font-medium text-[var(--color-fg)]">{item.subject}</span>
        <span className="mt-0.5 block text-xs text-[var(--color-fg-muted)]">#{item.id}</span>
      </td>
      <td className="px-4 py-3 text-[var(--color-fg-muted)]">
        {formatBroadcastSegment(item.segment)}
      </td>
      <td className="px-4 py-3 text-[var(--color-fg-muted)]">
        {formatChannels(item.emailEnabled, item.inAppEnabled)}
      </td>
      <td className="px-4 py-3">
        <StatusPill status={item.status} />
      </td>
      <td className="px-4 py-3 text-[var(--color-fg-muted)]">
        {/* A draft has no delivery figures at all, and an em dash says so. A "0
            sent" here would read as a send that reached nobody — the one thing
            an admin would investigate, on the rows where nothing was ever
            attempted. */}
        {item.status === 'DRAFT'
          ? '—'
          : formatDeliverySummary({
              sent: item.sentCount,
              skipped: item.skippedCount,
              failed: item.failedCount,
              ...(item.status === 'SENDING' && item.recipientCount !== null
                ? {
                    pending: Math.max(
                      0,
                      item.recipientCount -
                        item.sentCount -
                        item.skippedCount -
                        item.failedCount,
                    ),
                  }
                : {}),
            })}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-[var(--color-fg-muted)]">
        {formatDateIst(item.createdAt)}
      </td>
      <td className="px-4 py-3">
        {/* Self-describing out of context: twenty links all named "Open" is what
            a screen-reader user hears when listing this page's controls. The
            visible word stays FIRST so voice control still matches "click Open"
            (WCAG 2.5.3 Label in Name). */}
        <Link
          href={broadcastDetailHref(item.id, tab, page, q)}
          className="rounded font-medium text-[var(--color-primary-700)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        >
          Open
          <span className="sr-only"> broadcast {item.id}</span>
        </Link>
      </td>
    </tr>
  );
}

// A neutral pill. This console's palette rule is monochrome plus one accent
// (CLAUDE.md §2), and the states are distinguished by WEIGHT AND FOREGROUND, not
// hue — --color-success on --color-bg-muted measures 2.76:1, below the 4.5:1
// WCAG AA floor for 12px text, which is why the job-postings pill took the same
// fix.
//
// SENDING and FAILED are the two that carry weight: one is still moving and one
// wants attention. A finished SENT broadcast is the resting state and needs no
// emphasis at all.
function StatusPill({ status }: { status: BroadcastListItem['status'] }) {
  const notable = isInFlight(status) || status === 'FAILED';
  return (
    <span
      className={`inline-block rounded-md bg-[var(--color-bg-muted)] px-2 py-1 text-xs ${
        notable ? 'font-medium text-[var(--color-fg)]' : 'text-[var(--color-fg-muted)]'
      }`}
    >
      {formatBroadcastStatus(status)}
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
  tab: BroadcastTab;
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
        Page {formatCount(page)} of {formatCount(lastPage)}
      </span>
      <span className="flex gap-2">
        {page > 1 && (
          <Link
            href={broadcastsHref(tab, page - 1, q)}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]"
          >
            Previous
          </Link>
        )}
        {page < lastPage && (
          <Link
            href={broadcastsHref(tab, page + 1, q)}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]"
          >
            Next
          </Link>
        )}
      </span>
    </nav>
  );
}
