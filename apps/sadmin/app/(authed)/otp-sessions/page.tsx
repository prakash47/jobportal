import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Check } from '@jobportal/ui/icons';
import { RevealCodeButton } from '../../../components/otp-sessions/RevealCodeButton';
import { formatDateTimeIst } from '../../../lib/jobs/format';
import {
  clampPage,
  deriveChallengeState,
  formatIndianMobile,
  lastPageFor,
  otpSessionsHref,
  type OtpSessionChallenge,
  type OtpSessionRow,
} from '../../../lib/otp-sessions/format';
import { listOtpSessions } from '../../../lib/otp-sessions/queries';

export const metadata: Metadata = {
  title: 'OTP Sessions — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

// Reads Postgres per request; there is nothing to statically render, and a
// cached copy of this table would be worse than useless — every code on it dies
// within fifteen minutes.
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function OtpSessionsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = clampPage(sp.page);

  const result = await listOtpSessions(page);

  // One shared anchor for the read-at line and every code cell on the page, so
  // that no two cells can disagree about whether the same expiry had passed, and
  // the timestamp printed to the admin is exactly the one those states were
  // derived against.
  const now = new Date();

  // An over-range ?page must not render the empty state: `total` is non-zero, so
  // "No one is signing up right now" would be a lie, and the table and
  // pagination both live in the non-empty branch — leaving an admin on a dead
  // end with no control to get back. Redirect to the real last page instead,
  // sharing its href builder with the pagination links so the two cannot
  // disagree. Guarded on page > 1 so a genuinely empty list still reaches its
  // empty state rather than looping.
  //
  // ⚠ DO NOT ADD A loading.tsx TO THIS SEGMENT. A loading.tsx opens a Suspense
  // boundary that flushes the shell before this redirect throws, so the response
  // has already committed 200 and Next degrades the server redirect to a
  // client-side one. That was measured on the sibling /employers route
  // (?page=99 returned "307 → /sadmin/employers" without the file and a bare 200
  // with it) and is why neither that segment nor /jobs has one. This is a
  // constraint, not an oversight.
  if (page > 1 && result.rows.length === 0 && result.total > 0) {
    const lastPage = lastPageFor(result.total, result.pageSize);
    if (page > lastPage) redirect(otpSessionsHref(lastPage));
  }

  return (
    <div data-wide className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          OTP Sessions
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Verification codes for recruiters part-way through creating an account. One row per signup
          attempt, most recently active first. No SMS or email provider is wired for these yet, so a
          code only reaches the registrant when someone here reads it out.
        </p>
      </header>

      <div className="space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-4 py-3 text-sm text-[var(--color-fg-muted)]">
        {/* The wording names the states the table actually shows — Reveal,
            Verified, Expired — rather than the internal "live". */}
        <p>
          Each code is single-use and expires fifteen minutes after it is generated. Only a code you
          can still <strong className="font-medium">Reveal</strong> is worth relaying: a channel
          marked Verified or Expired has nothing left to give, and asking the registrant to request
          a fresh code is faster than re-reading a dead one. Every reveal is recorded against your
          account.
        </p>
        {/* The read-at line is not decoration. This page is server-rendered and
            never refreshes itself, so a tab left open keeps showing codes as
            live long after they died — precisely the mistake this table must
            not cause. Rendered outside the empty/non-empty branches so the
            freshness of an empty answer is stated too. */}
        <p>
          Read at {formatDateTimeIst(now)}. This page does not update on its own — reload it before
          relaying a code.
        </p>
      </div>

      {result.rows.length === 0 ? (
        <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 text-sm text-[var(--color-fg-muted)]">
          No one is signing up right now. Codes appear here the moment a recruiter requests one,
          newest first.
        </p>
      ) : (
        <>
          <p className="text-sm text-[var(--color-fg-muted)]">
            {result.total.toLocaleString('en-IN')}{' '}
            {result.total === 1 ? 'signup in progress' : 'signups in progress'}
          </p>

          {/* The table scrolls inside its own card rather than the document —
              the (authed) layout clips document-level horizontal overflow for
              data-wide pages. */}
          <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    User name
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Email
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Mobile
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Email OTP
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Mobile OTP
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Last generated
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {result.rows.map((row) => (
                  <OtpSessionTableRow key={row.signupId} row={row} now={now} />
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

function OtpSessionTableRow({ row, now }: { row: OtpSessionRow; now: Date }) {
  return (
    <tr className="hover:bg-[var(--color-bg-muted)]">
      <td className="px-4 py-3">
        {/* Registrant-typed free text shown to staff: rendered as plain text,
            never markup, the same rule the job review screen applies to
            recruiter copy. Null means every row's name was blank. */}
        <span className="font-medium text-[var(--color-fg)]">{row.name ?? '—'}</span>
      </td>

      <td className="px-4 py-3 text-[var(--color-fg-muted)]">{row.email?.destination ?? '—'}</td>

      <td className="px-4 py-3 text-[var(--color-fg-muted)]">
        {row.phone ? formatIndianMobile(row.phone.destination) : '—'}
      </td>

      <td className="px-4 py-3">
        <OtpCodeCell challenge={row.email} now={now} channelNoun="email" />
      </td>

      <td className="px-4 py-3">
        <OtpCodeCell challenge={row.phone} now={now} channelNoun="mobile" />
      </td>

      <td className="px-4 py-3 text-[var(--color-fg-muted)]">
        {formatDateTimeIst(row.lastGeneratedAt)}
      </td>
    </tr>
  );
}

function OtpCodeCell({
  challenge,
  now,
  channelNoun,
}: {
  challenge: OtpSessionChallenge | null;
  now: Date;
  channelNoun: string;
}) {
  const state = deriveChallengeState(challenge, now);

  // `challenge` is non-null in every state except ABSENT, but that is a fact
  // about deriveChallengeState rather than something the compiler can read off
  // the returned value, so the reveal branch below needs the value guarded here.
  if (state === 'ABSENT' || challenge === null) {
    return <span className="text-[var(--color-fg-muted)]">—</span>;
  }

  if (state === 'VERIFIED') {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-fg)]">
        {/* The word carries the meaning; the tick is decoration and is hidden
            from assistive tech, so a green glyph is never the only signal. */}
        <Check aria-hidden="true" className="size-4 text-[var(--color-success)]" />
        Verified
      </span>
    );
  }

  if (state === 'EXPIRED') {
    // Deliberately no digits. A staff member mid-call reads whatever is legible
    // regardless of how it is coloured, so the only reliable way to stop a dead
    // code being relayed is not to print it. The hairline-ring pill is this
    // portal's treatment for a label that has to sit on either the elevated card
    // or the row's hover surface — see the (authed) layout's "Internal" pill.
    return (
      <span className="inline-flex items-center rounded-full bg-[var(--color-bg-elevated)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-fg-muted)] ring-1 ring-[var(--color-border)] ring-inset">
        Expired
      </span>
    );
  }

  return (
    <RevealCodeButton
      challengeId={challenge.id}
      channelNoun={channelNoun}
      destination={challenge.destination}
    />
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
            href={otpSessionsHref(page - 1)}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]"
          >
            Previous
          </Link>
        )}
        {page < lastPage && (
          <Link
            href={otpSessionsHref(page + 1)}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]"
          >
            Next
          </Link>
        )}
      </span>
    </nav>
  );
}
