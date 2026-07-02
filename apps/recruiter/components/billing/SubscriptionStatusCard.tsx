import Link from 'next/link';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@jobportal/ui';
import {
  SubscriptionStatusBadge,
  type SubscriptionBadgeStatus,
} from './SubscriptionStatusBadge';

// Current-subscription summary for /billing: plan, status badge, expiry, and
// the Upgrade/Browse CTA that routes to /plans (the purchase page). Server-
// renderable; all data is resolved by the page RSC.

export interface SubscriptionSummary {
  planName: string;
  status: SubscriptionBadgeStatus;
  periodEnd: string | null; // ISO — null for FREE
  daysLeft: number | null;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function SubscriptionStatusCard({
  summary,
  canManage,
}: {
  summary: SubscriptionSummary;
  canManage: boolean;
}) {
  const isPaidActive = summary.status === 'ACTIVE' || summary.status === 'TRIALING';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{summary.planName}</CardTitle>
          <SubscriptionStatusBadge status={summary.status} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end justify-between gap-4">
        <div className="text-sm text-[var(--color-fg-muted)]">
          {summary.periodEnd ? (
            isPaidActive ? (
              <p>
                Valid until{' '}
                <span className="font-medium text-[var(--color-fg)]">
                  {fmtDate(summary.periodEnd)}
                </span>
                {summary.daysLeft !== null && (
                  <span>
                    {' '}
                    · {summary.daysLeft} {summary.daysLeft === 1 ? 'day' : 'days'} left
                  </span>
                )}
              </p>
            ) : (
              <p>
                {summary.status === 'EXPIRED' ? 'Expired on' : 'Ended on'}{' '}
                <span className="font-medium text-[var(--color-fg)]">
                  {fmtDate(summary.periodEnd)}
                </span>
                . Your team is on the free plan.
              </p>
            )
          ) : (
            <p>
              Post jobs and manage applicants for free. Upgrade for higher limits and more
              features.
            </p>
          )}
        </div>
        {canManage && (
          <Button asChild variant={isPaidActive ? 'secondary' : 'primary'}>
            <Link href="/plans">{isPaidActive ? 'Upgrade or renew' : 'View plans & pricing'}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
