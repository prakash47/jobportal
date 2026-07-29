import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { formatDateIst, formatKycStatus } from '../../../lib/jobs/format';
import {
  clampPage,
  deriveAccountState,
  displayName,
  employersHref,
  formatAccountState,
  formatCompanyRole,
  lastPageFor,
  resolveContact,
  type AccountState,
} from '../../../lib/employers/format';
import { listEmployers, type EmployerListRow } from '../../../lib/employers/queries';

export const metadata: Metadata = {
  title: 'Employer management — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

// Reads Postgres per request; there is nothing to statically render.
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function EmployersPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = clampPage(sp.page);

  const result = await listEmployers(page);

  // An over-range ?page must not render the empty state: `total` is non-zero, so
  // "No employers have registered yet" would be a lie, and the count, table and
  // pagination all live in the non-empty branch — leaving an admin on a dead end
  // with no control to get back. Redirect to the real last page instead, sharing
  // its href builder with the pagination links so the two cannot disagree.
  // Guarded on page > 1 so a genuinely empty list still reaches its empty state
  // rather than looping.
  //
  // ⚠ DO NOT ADD A loading.tsx TO THIS SEGMENT. It was written, measured and
  // removed. A loading.tsx opens a Suspense boundary that flushes the shell
  // before this redirect throws, so the response has already committed 200 and
  // Next degrades the server redirect to a client-side one. Measured on this
  // route: ?page=99 returned "307 → /sadmin/employers" without it and a bare 200
  // with it. Because a loading.tsx also wraps NESTED segments, the same file
  // turned [id]'s notFound() into a soft 404 (200) — verified both directions by
  // adding and removing the file. This is also why the sibling /jobs queue has
  // none; that is a constraint, not an oversight.
  if (page > 1 && result.rows.length === 0 && result.total > 0) {
    const lastPage = lastPageFor(result.total, result.pageSize);
    if (page > lastPage) redirect(employersHref(lastPage));
  }

  return (
    <div data-wide className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          Employer management
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Every company registered on the platform, newest first. One row per employer — a company
          can have several recruiters, so the contact shown is the person who speaks for it.
        </p>
      </header>

      {result.rows.length === 0 ? (
        <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 text-sm text-[var(--color-fg-muted)]">
          No employers have registered yet.
        </p>
      ) : (
        <>
          <p className="text-sm text-[var(--color-fg-muted)]">
            {result.total.toLocaleString('en-IN')}{' '}
            {result.total === 1 ? 'employer' : 'employers'}
          </p>

          {/* The table scrolls inside its own card rather than the document —
              the root layout clips document-level horizontal overflow for
              data-wide pages. */}
          <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Company
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Contact person
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Email
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Phone
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Registered
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Account status
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {result.rows.map((row) => (
                  <EmployerRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={result.page} total={result.total} pageSize={result.pageSize} />
        </>
      )}
    </div>
  );
}

function EmployerRow({ row }: { row: EmployerListRow }) {
  const contact = resolveContact(row.team);
  const state = deriveAccountState(row.team);

  return (
    <tr className="hover:bg-[var(--color-bg-muted)]">
      <td className="px-4 py-3">
        {/* Company.name is recruiter-authored free text being shown to staff.
            Rendered as plain text, never markup — the same rule the job review
            screen applies to recruiter copy. */}
        <Link
          href={`/employers/${row.id}`}
          className="font-medium text-[var(--color-fg)] hover:underline"
        >
          {row.name}
        </Link>
      </td>

      <td className="px-4 py-3 text-[var(--color-fg-muted)]">
        {contact ? (
          <span className="block">
            <span className="text-[var(--color-fg)]">{displayName(contact.person)}</span>
            {/* The role is always shown. Without it a Member standing in for a
                removed owner would read as the owner. */}
            <span className="mt-0.5 block text-xs">
              {formatCompanyRole(contact.person.companyRole)}
            </span>
          </span>
        ) : (
          '—'
        )}
      </td>

      <td className="px-4 py-3 text-[var(--color-fg-muted)]">
        {contact ? contact.person.email : '—'}
      </td>

      <td className="px-4 py-3 text-[var(--color-fg-muted)]">
        {/* Recruiter.contactPhone only. Deliberately NOT falling back to
            altPocPhone: that is a BACKUP contact's number, and printing it under
            this person's name would attribute it to the wrong human. */}
        {contact?.person.contactPhone ?? '—'}
      </td>

      <td className="px-4 py-3 text-[var(--color-fg-muted)]">{formatDateIst(row.registeredAt)}</td>

      <td className="px-4 py-3">
        <AccountStatusCell state={state} kycStatus={row.kycStatus} />
      </td>

      <td className="px-4 py-3">
        <Link
          href={`/employers/${row.id}`}
          className="font-medium text-[var(--color-primary-700)] hover:underline"
        >
          View profile
          {/* Row actions must be self-describing out of context: a screen-reader
              user listing links otherwise hears "View profile" fourteen times. */}
          <span className="sr-only"> for {row.name}</span>
        </Link>
      </td>
    </tr>
  );
}

// Raw --color-danger is #e62b34 — 4.41:1 on the elevated card and 4.02:1 once
// the row switches to bg-muted on hover, both under the 4.5:1 AA floor for 14px
// text. That would have made the one label an admin most needs to read the least
// legible thing on the page. Mixing in 30% of --color-fg darkens it on light and
// lightens it on dark, so it stays theme-aware without touching the shared
// theme.css: measured 7.03:1 and 6.45:1 on the two light surfaces. Same
// expression apps/recruiter's JobValidityCard uses for the same reason.
const DANGER_TEXT = 'text-[color-mix(in_oklch,var(--color-danger),var(--color-fg)_30%)]';

// Only the exceptional states are coloured. Colouring "Active" too would tint
// almost every row and drown out the handful that actually need an admin's
// attention, which is the whole job of this column. Colour is never the only
// signal — the label itself always says which state it is.
const STATE_TONE: Record<AccountState, string> = {
  ACTIVE: 'text-[var(--color-fg)]',
  DEACTIVATED: DANGER_TEXT,
  NO_ACCOUNT: 'text-[var(--color-fg-muted)]',
};

function AccountStatusCell({ state, kycStatus }: { state: AccountState; kycStatus: string }) {
  return (
    <span className="block">
      <span className={`font-medium ${STATE_TONE[state]}`}>{formatAccountState(state)}</span>
      {/* Verification is the second axis the owner asked for. It is a separate
          fact from whether anyone can sign in: a verified company can have no
          active recruiter, and an active one can be entirely unverified. */}
      <span className="mt-0.5 block text-xs text-[var(--color-fg-muted)]">
        {formatKycStatus(kycStatus)}
      </span>
    </span>
  );
}

function Pagination({ page, total, pageSize }: { page: number; total: number; pageSize: number }) {
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
            href={employersHref(page - 1)}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]"
          >
            Previous
          </Link>
        )}
        {page < lastPage && (
          <Link
            href={employersHref(page + 1)}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]"
          >
            Next
          </Link>
        )}
      </span>
    </nav>
  );
}
