import Link from 'next/link';
import { Suspense } from 'react';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { Button } from '@jobportal/ui';
import { getDashboardRecruiter } from '../../../lib/dashboard/queries';
import { computeVerificationProgress } from '../../../lib/dashboard/verification';
import { VerificationCard } from '../../../components/dashboard/VerificationCard';
import { DashboardKpis } from '../../../components/dashboard/DashboardKpis';
import { KpiSkeleton } from '../../../components/dashboard/DashboardSkeleton';

// Recruiter dashboard (SRS §4.9) — verification progress first, then the
// company's hiring KPIs.
//
// LOAD SHAPE. This is the first page after sign-in and it is the heaviest read
// in the portal, so the work is split by cost rather than run as one blocking
// batch:
//
//   • The verification card needs ONE query and is what the recruiter must see
//     first, so it is awaited here and painted with the shell.
//   • The KPI half needs SIX aggregate queries, so it sits behind <Suspense>
//     and streams in behind a skeleton. Slow metrics can no longer hold up the
//     thing the recruiter actually needs to act on.
//
// The single query behind the card is memoised with React cache(), so asking
// for it from more than one place in a render costs nothing extra. No route
// config is needed to stream: the (authed) layout already forces dynamic
// rendering, which controls WHEN the render happens, not how it is flushed.
//
// Display-only — every number is read straight from Postgres in the RSC per the
// reads/writes split. No BFF endpoint, no schema change, no feature flag of its
// own (this is a free surface; CLAUDE.md §4 scopes the flag mandate to paid
// features). The one flag consulted is the KYC killswitch, so the card never
// links into a route that 404s.

export default async function DashboardPage() {
  const [recruiter, kycDisabled] = await Promise.all([
    getDashboardRecruiter(),
    isFlagEnabled('killswitch.recruiter_kyc'),
  ]);

  if (!recruiter) {
    return (
      <div className="rounded-md border border-dashed border-[var(--color-border)] p-10 text-center text-sm text-[var(--color-fg-muted)]">
        Recruiter profile not found. If you just registered, please reload.
      </div>
    );
  }

  const progress = computeVerificationProgress({
    workEmailVerified: recruiter.workEmailVerified,
    email: recruiter.email,
    company: recruiter.company,
    kyc: recruiter.kyc,
    kycDisabled,
  });

  return (
    // data-wide opts into the layout's max-w-6xl column — a three-across metric
    // grid does not fit the default reading width (same opt-in the Jobs list and
    // Job Detail use).
    <div data-wide className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Hiring activity across {recruiter.companyName}.
          </p>
        </div>
        <Button asChild variant="primary">
          <Link href="/post-job">Post a job</Link>
        </Button>
      </header>

      <VerificationCard progress={progress} />

      <Suspense fallback={<KpiSkeleton />}>
        <DashboardKpis companyId={recruiter.companyId} userId={recruiter.userId} />
      </Suspense>
    </div>
  );
}
