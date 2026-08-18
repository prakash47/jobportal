import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { formatDateIst } from '../../../lib/jobs/format';
import {
  SUPPORT_TABS,
  SUPPORT_TAB_LABEL,
  clampPage,
  contactMessagesHref,
  firstParam,
  formatPersonName,
  formatSupportCategory,
  formatSupportStatus,
  formatTicketsSummary,
  isOpenTicket,
  lastPageFor,
  normalizeQuery,
  parseSupportTab,
  supportHref,
  ticketDetailHref,
  type SupportTab,
} from '../../../lib/support/format';
import { listTickets, pageSizeOf } from '../../../lib/support/queries';
import type { TicketListItem } from '../../../lib/support/types';
import { SupportSearchBar } from '../../../components/support/SupportSearchBar';

export const metadata: Metadata = {
  title: 'Support & Communication — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

// Reads the API per request; there is nothing to statically render.
export const dynamic = 'force-dynamic';

// Typed as Next actually delivers it, not as we wish it were: a REPEATED key
// (`?q=a&q=b`) arrives as an ARRAY, so all three params go through firstParam /
// parseSupportTab. Typing these as bare strings is what let an array reach
// `raw.trim()` and 500 the sibling /candidates route.
interface PageProps {
  searchParams: Promise<{
    status?: string | string[];
    q?: string | string[];
    page?: string | string[];
  }>;
}

export default async function SupportPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const status = parseSupportTab(sp.status);
  const q = normalizeQuery(firstParam(sp.q));
  const page = clampPage(firstParam(sp.page));

  // No feature-flag read here, and none anywhere in this console. The support
  // module is deliberately NOT killswitch-gated — admin-support.controller.ts
  // argues the case: staff must keep working existing tickets while the
  // recruiter-facing surface is paused by killswitch.recruiter_help_support.
  const result = await listTickets(status, page, q);

  if (!result.ok) {
    return (
      <div data-wide className="space-y-6">
        <Header />
        {/* Names what actually failed. The API being unreachable and a genuinely
            empty queue look identical if both render "no tickets", and staff
            would conclude support is quiet rather than broken. */}
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
  // "There are no open tickets" would be a lie, and the count, table and
  // pagination all live in the non-empty branch — leaving staff on a dead end
  // with no control to get back. Redirect to the real last page instead, sharing
  // its href builder with the tabs and the pagination links so the three cannot
  // disagree. Guarded on page > 1 so a genuinely empty queue still reaches its
  // empty state rather than looping.
  //
  // ⚠ DO NOT ADD A loading.tsx TO THIS SEGMENT. A loading.tsx opens a Suspense
  // boundary that flushes the shell before this redirect throws, so the response
  // has already committed 200 and Next degrades the server redirect to a
  // client-side one — measured on /employers, and the same file turned [id]'s
  // notFound() into a soft 404.
  if (page > 1 && data.items.length === 0 && data.total > 0) {
    const lastPage = lastPageFor(data.total, pageSize);
    if (page > lastPage) redirect(supportHref(status, lastPage, q));
  }

  const isEmpty = data.items.length === 0;
  const summary = formatTicketsSummary(data.total, status, q);

  return (
    <div data-wide className="space-y-6">
      <Header />

      {/* Status tabs. Each link carries the active search, so switching tabs
          narrows rather than resets. */}
      <nav
        aria-label="Filter by status"
        className="flex flex-wrap gap-1 border-b border-[var(--color-border)]"
      >
        {SUPPORT_TABS.map((tab) => {
          const active = tab === status;
          return (
            <Link
              key={tab}
              href={supportHref(tab, 1, q)}
              aria-current={active ? 'page' : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
                active
                  ? 'border-[var(--color-primary-600)] font-medium text-[var(--color-fg)]'
                  : 'border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
              }`}
            >
              {SUPPORT_TAB_LABEL[tab]}
            </Link>
          );
        })}
      </nav>

      <SupportSearchBar />

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
                    Company
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Raised by
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Category
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Replies
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Raised
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {data.items.map((item) => (
                  <TicketRow key={item.id} item={item} status={status} page={data.page} q={q} />
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            status={status}
            page={data.page}
            total={data.total}
            pageSize={pageSize}
            q={q}
          />
        </>
      )}
    </div>
  );
}

function Header() {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          Support &amp; Communication
        </h1>
        {/* Says "recruiters" rather than "users", because that is the truth:
            SupportTicket.companyId is a required FK, so a candidate cannot raise
            one and there is no candidate-facing contact form anywhere. A console
            promising every user's queries while showing only recruiters' would
            let staff conclude candidates simply never write in. */}
        <p className="text-sm text-[var(--color-fg-muted)]">
          Queries and complaints raised by recruiters. Open one to read the thread, reply, move it
          through the workflow, or leave an internal note.
        </p>
      </div>
      <Link
        href={contactMessagesHref(1)}
        className="rounded text-sm font-medium text-[var(--color-primary-700)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
      >
        Contact messages
      </Link>
    </header>
  );
}

function TicketRow({
  item,
  status,
  page,
  q,
}: {
  item: TicketListItem;
  status: SupportTab;
  page: number;
  q: string | undefined;
}) {
  return (
    <tr className="hover:bg-[var(--color-bg-muted)]">
      {/* Recruiter-authored free text shown to staff: plain text, never markup —
          the same rule the job review screen applies. */}
      <td className="px-4 py-3">
        <span className="block font-medium text-[var(--color-fg)]">{item.subject}</span>
        <span className="mt-0.5 block text-xs text-[var(--color-fg-muted)]">#{item.id}</span>
      </td>
      <td className="px-4 py-3 text-[var(--color-fg-muted)]">{item.company.name}</td>
      <td className="px-4 py-3">
        <span className="block text-[var(--color-fg)]">{formatPersonName(item.user)}</span>
        <span className="block text-xs text-[var(--color-fg-muted)]">{item.user.email}</span>
      </td>
      <td className="px-4 py-3 text-[var(--color-fg-muted)]">
        {formatSupportCategory(item.category)}
      </td>
      <td className="px-4 py-3">
        <StatusPill status={item.status} />
      </td>
      {/* "Replies", not "Msgs": the count is SupportTicketMessage rows, which
          excludes the opening description. Labelling it "Messages" would read as
          "1" on a brand-new ticket that has had no response at all. Internal
          notes are deliberately not counted here — the queue is a shared view and
          a note count would advertise which tickets staff have been discussing. */}
      <td className="px-4 py-3 text-[var(--color-fg-muted)]">{item.messageCount}</td>
      <td className="px-4 py-3 whitespace-nowrap text-[var(--color-fg-muted)]">
        {formatDateIst(item.createdAt)}
      </td>
      <td className="px-4 py-3">
        {/* Self-describing out of context: twenty links all named "Open" is what
            a screen-reader user hears when listing this page's controls. The
            visible word stays FIRST so voice control still matches "click Open"
            (WCAG 2.5.3 Label in Name). */}
        <Link
          href={ticketDetailHref(item.id, status, page, q)}
          className="rounded font-medium text-[var(--color-primary-700)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        >
          Open
          <span className="sr-only"> ticket {item.id}</span>
        </Link>
      </td>
    </tr>
  );
}

// A neutral pill. This console's palette rule is monochrome plus one accent
// (CLAUDE.md §2), and painting OPEN amber would invent an alarm on a queue where
// every row is, by definition, already someone's problem.
//
// The still-to-do states are distinguished by WEIGHT AND FOREGROUND, not hue —
// the same fix the job-postings pill took after --color-success on
// --color-bg-muted measured 2.76:1, below the 4.5:1 WCAG AA floor for 12px text.
function StatusPill({ status }: { status: TicketListItem['status'] }) {
  const needsWork = isOpenTicket(status);
  return (
    <span
      className={`inline-block rounded-md bg-[var(--color-bg-muted)] px-2 py-1 text-xs ${
        needsWork ? 'font-medium text-[var(--color-fg)]' : 'text-[var(--color-fg-muted)]'
      }`}
    >
      {formatSupportStatus(status)}
    </span>
  );
}

function Pagination({
  status,
  page,
  total,
  pageSize,
  q,
}: {
  status: SupportTab;
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
            href={supportHref(status, page - 1, q)}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]"
          >
            Previous
          </Link>
        )}
        {page < lastPage && (
          <Link
            href={supportHref(status, page + 1, q)}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]"
          >
            Next
          </Link>
        )}
      </span>
    </nav>
  );
}
