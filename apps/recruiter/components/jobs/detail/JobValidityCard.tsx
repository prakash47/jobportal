import type { ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@jobportal/ui';
import { AlertCircle, Clock, Pencil, Zap } from '@jobportal/ui/icons';
import { daysUntilExpiry, formatListDate } from '../job-list-format';
import type { JobStatus } from '../JobStatusBadge';

export interface JobValidityCardProps {
  jobId: number;
  status: JobStatus;
  postedAt: Date;
  expiresAt: Date | null;
  /** Whether the Plans & Billing surface is reachable (recruiter.plans_visible).
   * The Upgrade CTA only renders when ON, so it never dead-links to a 404'd
   * /plans (L2 UX gate). Note this tracks VISIBILITY, not purchasability — the
   * plans page itself explains that paid tiers aren't open yet, which is a
   * better destination than hiding the CTA outright. */
  billingEnabled: boolean;
}

function Row({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <span className="mt-0.5 shrink-0 text-[var(--color-fg-muted)]" aria-hidden="true">
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
        <span className="shrink-0 text-sm text-[var(--color-fg-muted)]">{label}</span>
        <span className="text-right text-sm font-medium text-[var(--color-fg)]">{value}</span>
      </div>
    </div>
  );
}

// §6 Posting validity & expiry. Shows the active window (posted → valid-until)
// and days remaining, and — when the posting is nearing expiry or already
// expired — surfaces Extend / Upgrade CTAs. "Extend" deep-links to the edit
// wizard (where the expiry date is editable via the existing PATCH — no
// dedicated extend endpoint exists yet); "Upgrade" points at Plans, gated so it
// only shows when billing is live.
export function JobValidityCard({
  jobId,
  status,
  postedAt,
  expiresAt,
  billingEnabled,
}: JobValidityCardProps) {
  const days = daysUntilExpiry(expiresAt);
  const isDraft = status === 'DRAFT' || status === 'PENDING_MODERATION';
  const isClosed = status === 'CLOSED';
  // A live posting whose expiry has already passed (before the nightly sweep
  // flips its status to EXPIRED) is treated the same as EXPIRED here.
  const isExpired = status === 'EXPIRED' || (status === 'ACTIVE' && days !== null && days < 0);
  // "Nearing expiry" = a live posting within a week of its expiry date.
  const isNearing = status === 'ACTIVE' && days !== null && days >= 0 && days <= 7;
  // Extend/Upgrade only make sense for a live posting that's expiring or one
  // that has already expired — never for a deliberately CLOSED job or an
  // unpublished DRAFT/PENDING posting (the card would otherwise offer to
  // "extend" a job the recruiter closed, contradicting its Closed badge).
  const showCta = isExpired || isNearing;

  let message: string;
  if (isDraft) {
    message = "This posting isn't published yet, so it has no active validity period.";
  } else if (isClosed) {
    message = 'This posting is closed and no longer visible to candidates.';
  } else if (isExpired) {
    message = 'This posting has expired and is no longer visible to candidates.';
  } else if (expiresAt === null) {
    message = 'No expiry date set — this posting stays live until you close it.';
  } else if (days === 0) {
    message = 'Expires today.';
  } else if (days !== null) {
    message = `Expires in ${days} ${days === 1 ? 'day' : 'days'}.`;
  } else {
    message = '';
  }

  return (
    <section
      aria-labelledby="validity-heading"
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5"
    >
      <h2 id="validity-heading" className="mb-3 text-sm font-semibold text-[var(--color-fg)]">
        Posting validity
      </h2>

      <div className="divide-y divide-[var(--color-border)]">
        <Row icon={<Clock className="size-4" />} label="Date posted" value={formatListDate(postedAt)} />
        <Row
          icon={<Clock className="size-4" />}
          label="Valid until"
          value={expiresAt ? formatListDate(expiresAt) : 'No expiry'}
        />
      </div>

      {message && (
        <p
          className={`mt-3 flex items-start gap-2 text-sm ${
            // Raw --color-danger as body text is ~4.4:1 on the elevated surface
            // (sub-AA). Mix in 30% of --color-fg so it darkens on light and
            // lightens on dark — theme-aware AA, no new token (the JobStatusBadge
            // darkening precedent). The decorative icon keeps the raw fill (3:1 OK).
            isExpired
              ? 'text-[color-mix(in_oklch,var(--color-danger),var(--color-fg)_30%)]'
              : 'text-[var(--color-fg)]'
          }`}
        >
          {showCta && (
            <AlertCircle
              className={`mt-0.5 size-4 shrink-0 ${
                isExpired ? 'text-[var(--color-danger)]' : 'text-[var(--color-fg-muted)]'
              }`}
              aria-hidden="true"
            />
          )}
          <span>{message}</span>
        </p>
      )}

      {showCta && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-4">
          <Button asChild variant="secondary" size="sm">
            <Link href={`/jobs/${jobId}/edit`}>
              <Pencil className="size-4" />
              Extend posting
            </Link>
          </Button>
          {billingEnabled && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/plans">
                <Zap className="size-4" />
                Upgrade
              </Link>
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
