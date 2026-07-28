import Link from 'next/link';
import { AlertCircle, ExternalLink, ShieldCheck } from '@jobportal/ui/icons';
import type { PendingApprovals as PendingApprovalsData } from '../../lib/dashboard/queries';

// The seeker app still hosts the admin KYC queue, so that row links out to a
// different origin. Job review now lives in this portal and links internally.
// The KYC console moves here in the /admin migration PR, at which point that
// row becomes an in-app link too.
const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

export function PendingApprovals({ data }: { data: PendingApprovalsData }) {
  const { companyVerification, jobPostings, moderationEnabled } = data;
  const nothingWaiting = companyVerification === 0 && jobPostings === 0;

  return (
    <section
      aria-labelledby="sadmin-approvals-heading"
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5"
    >
      <h2
        id="sadmin-approvals-heading"
        className="text-sm font-semibold text-[var(--color-fg)]"
      >
        Pending approvals
      </h2>
      <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
        {nothingWaiting
          ? 'Nothing is waiting on a reviewer.'
          : 'Waiting on a reviewer.'}
      </p>

      <dl className="mt-4 divide-y divide-[var(--color-border)]">
        {/* Company verification — a live queue with a real destination. */}
        <div className="flex items-center justify-between gap-4 py-3">
          <dt className="flex min-w-0 items-center gap-2 text-sm text-[var(--color-fg)]">
            <ShieldCheck
              className="size-4 shrink-0 text-[var(--color-fg-muted)]"
              aria-hidden="true"
            />
            Company verification
          </dt>
          <dd className="flex shrink-0 items-center gap-3">
            <span
              className={`text-lg font-semibold tabular-nums ${
                companyVerification === 0
                  ? 'text-[var(--color-fg-muted)]'
                  : 'text-[var(--color-fg)]'
              }`}
            >
              {companyVerification.toLocaleString('en-IN')}
            </span>
            {companyVerification > 0 && (
              <a
                // ?status=PENDING, matching the count beside it. Without the
                // param the admin queue applies no filter and resolves to
                // "everything except NOT_SUBMITTED" — PENDING plus already
                // decided VERIFIED and REJECTED rows — so a reviewer clicking a
                // "1" would land on a longer list and have to find the one item
                // that is actually waiting.
                href={`${WEB_URL}/admin/kyc-review?status=PENDING`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-[var(--color-primary-700)] hover:underline"
              >
                Review
                {/* The label says where you land; the icon alone would not tell
                    a screen-reader user this leaves the portal. */}
                <ExternalLink className="size-3.5" aria-hidden="true" />
                <span className="sr-only">(opens the admin console in a new tab)</span>
              </a>
            )}
          </dd>
        </div>

        {/* Job postings — the queue now lives in this portal, so this is an
            in-app link rather than a cross-origin one: no target="_blank", and
            no "opens in a new tab" hint to go with it. */}
        <div className="flex items-center justify-between gap-4 py-3">
          <dt className="flex min-w-0 items-center gap-2 text-sm text-[var(--color-fg)]">
            <AlertCircle
              className="size-4 shrink-0 text-[var(--color-fg-muted)]"
              aria-hidden="true"
            />
            Job postings
          </dt>
          <dd className="flex shrink-0 items-center gap-3">
            <span
              className={`text-lg font-semibold tabular-nums ${
                jobPostings === 0
                  ? 'text-[var(--color-fg-muted)]'
                  : 'text-[var(--color-fg)]'
              }`}
            >
              {jobPostings.toLocaleString('en-IN')}
            </span>
            {jobPostings > 0 && (
              <Link
                href="/jobs"
                className="rounded-md text-sm font-medium text-[var(--color-primary-700)] hover:underline"
              >
                Review
              </Link>
            )}
          </dd>
        </div>
      </dl>

      {/* Without this, a permanent "0" reads as "all caught up" when the truth
          is that the queue is switched off and nothing can enter it. */}
      {!moderationEnabled && (
        <p className="mt-3 text-xs text-[var(--color-fg-muted)]">
          Job moderation is currently off, so new postings go live without review.
        </p>
      )}
    </section>
  );
}
