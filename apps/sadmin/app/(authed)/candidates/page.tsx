import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Avatar } from '@jobportal/ui';
import { formatDateIst } from '../../../lib/jobs/format';
import { displayName } from '../../../lib/employers/format';
import {
  candidatesHref,
  clampPage,
  formatHeadline,
  initials,
  lastPageFor,
  normalizeQuery,
} from '../../../lib/candidates/format';
import { listCandidates, type CandidateListRow } from '../../../lib/candidates/queries';
import { CandidateSearchBar } from '../../../components/candidates/CandidateSearchBar';

export const metadata: Metadata = {
  title: 'Candidate management — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

// Reads Postgres per request; there is nothing to statically render.
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ q?: string; page?: string }>;
}

export default async function CandidatesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const q = normalizeQuery(sp.q);
  const page = clampPage(sp.page);

  const result = await listCandidates(page, q);

  // An over-range ?page must not render the empty state: `total` is non-zero, so
  // "No candidates have registered yet" would be a lie, and the count, table and
  // pagination all live in the non-empty branch — leaving an admin on a dead end
  // with no control to get back. Redirect to the real last page instead, sharing
  // its href builder with the pagination links so the two cannot disagree. The
  // active search is carried through; dropping it would silently clear the
  // filter. Guarded on page > 1 so a genuinely empty list still reaches its
  // empty state rather than looping.
  //
  // ⚠ DO NOT ADD A loading.tsx TO THIS SEGMENT. A loading.tsx opens a Suspense
  // boundary that flushes the shell before this redirect throws, so the response
  // has already committed 200 and Next degrades the server redirect to a
  // client-side one. Measured on the sibling /employers route: ?page=99 returned
  // "307 → /sadmin/employers" without it and a bare 200 with it, and the same
  // file turned [id]'s notFound() into a soft 404. This is why /employers,
  // /jobs and /otp-sessions all lack one — a constraint, not an oversight.
  if (page > 1 && result.rows.length === 0 && result.total > 0) {
    const lastPage = lastPageFor(result.total, result.pageSize);
    if (page > lastPage) redirect(candidatesHref(lastPage, q));
  }

  return (
    <div data-wide className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          Candidate management
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Every job seeker registered on the platform, newest first. One row per account — a
          seeker&rsquo;s profile details appear once they have filled them in.
        </p>
      </header>

      <CandidateSearchBar />

      {result.rows.length === 0 ? (
        // Two different sentences, because under an active filter the
        // "nobody has registered" copy would be a lie.
        <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 text-sm text-[var(--color-fg-muted)]">
          {q ? `No candidates match “${q}”.` : 'No candidates have registered yet.'}
        </p>
      ) : (
        <>
          <p className="text-sm text-[var(--color-fg-muted)]">
            {result.total.toLocaleString('en-IN')}{' '}
            {result.total === 1 ? 'candidate' : 'candidates'}
            {q ? ` matching “${q}”` : ''}
          </p>

          {/* The table scrolls inside its own card rather than the document —
              the app shell locks the viewport (h-screen + overflow-hidden) and
              scrolls each pane independently. */}
          <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Candidate
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Headline
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Contact
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Location
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Registered
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {result.rows.map((row) => (
                  <CandidateRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={result.page} total={result.total} pageSize={result.pageSize} q={q} />
        </>
      )}
    </div>
  );
}

function CandidateRow({ row }: { row: CandidateListRow }) {
  // User.name is NOT NULL but not guaranteed non-blank; the email is the only
  // always-present unique identifier. Same helper the employer list uses.
  const name = displayName(row);

  return (
    <tr className="hover:bg-[var(--color-bg-muted)]">
      <td className="px-4 py-3">
        <span className="flex items-center gap-3">
          {/* User.image is populated only by the Google signup path, so the
              monogram is the COMMON case here, not a rare fallback. Radix's
              Avatar also swaps to it when a stored provider URL has expired —
              a bare <img> would render a broken-image glyph instead.
              next/image is not an option: this app's basePath is not applied to
              a string src, and next.config declares no images.remotePatterns. */}
          {/* `src` is spread conditionally rather than passed as
              `row.image ?? undefined`: tsconfig sets exactOptionalPropertyTypes,
              under which an explicit `undefined` is not assignable to an
              optional `src?: string`. Omitting the prop is exactly what Avatar
              expects — it renders the Image child only when src is truthy. */}
          <Avatar
            size="sm"
            alt=""
            fallback={initials(name)}
            {...(row.image ? { src: row.image } : {})}
          />
          {/* Seeker-authored free text shown to staff: plain text, never
              markup — the same rule the job review screen applies. */}
          <span className="font-medium text-[var(--color-fg)]">{name}</span>
        </span>
      </td>

      <td className="px-4 py-3 text-[var(--color-fg-muted)]">{formatHeadline(row)}</td>

      <td className="px-4 py-3 text-[var(--color-fg-muted)]">
        <span className="block">
          <span className="text-[var(--color-fg)]">{row.email}</span>
          {/* User.phone is free-form and unverified for most accounts. Shown as
              written, never reformatted into a shape it may not be. */}
          <span className="mt-0.5 block text-xs">{row.phone ?? '—'}</span>
        </span>
      </td>

      <td className="px-4 py-3 text-[var(--color-fg-muted)]">{row.location ?? '—'}</td>

      <td className="px-4 py-3 text-[var(--color-fg-muted)]">{formatDateIst(row.registeredAt)}</td>

      <td className="px-4 py-3">
        <span className="flex items-center gap-3">
          <InertAction label="View" subject={name} />
          <InertAction label="Suspend" subject={name} />
          <InertAction label="Delete" subject={name} />
        </span>
      </td>
    </tr>
  );
}

/**
 * A row action that is visible but not yet wired.
 *
 * `aria-disabled` rather than the `disabled` attribute: `disabled` drops the
 * control out of the tab order entirely, so a keyboard user cannot reach it and
 * never learns the action exists. This way it is focusable and announced as
 * unavailable — the treatment apps/recruiter's JobRowMenu already uses.
 *
 * There is no `onClick`, so in this server component it ships zero JavaScript
 * and the click is a genuine no-op rather than a handler that swallows it.
 *
 * The name is carried by an explicit `aria-label` rather than a visually-hidden
 * span, because `title` was measured winning the accessible-name computation
 * over the button's own content: in the browser's a11y tree all sixty controls
 * came out named "Not available yet", so View, Suspend and Delete were
 * indistinguishable to a screen reader and the visible word was lost entirely.
 * `aria-label` outranks `title`, so the name is now unambiguous. It STARTS with
 * the visible label so voice control still matches "click View" (WCAG 2.5.3
 * Label in Name), and `title` is kept only for the sighted hover hint.
 *
 * Deliberately NOT dimmed with `opacity`, which drops 14px muted text below
 * legibility, and Delete is deliberately NOT red: colour here would promise a
 * destructive action that cannot happen yet. It earns the danger tone the day it
 * is wired.
 */
function InertAction({ label, subject }: { label: string; subject: string }) {
  return (
    <button
      type="button"
      aria-disabled="true"
      // Self-describing out of context: a screen-reader user listing the page's
      // controls otherwise hears the same three words twenty times over.
      aria-label={`${label} ${subject} — not available yet`}
      title="Not available yet"
      className="cursor-not-allowed rounded font-medium text-[var(--color-fg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
    >
      {label}
    </button>
  );
}

function Pagination({
  page,
  total,
  pageSize,
  q,
}: {
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
            href={candidatesHref(page - 1, q)}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]"
          >
            Previous
          </Link>
        )}
        {page < lastPage && (
          <Link
            href={candidatesHref(page + 1, q)}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]"
          >
            Next
          </Link>
        )}
      </span>
    </nav>
  );
}
