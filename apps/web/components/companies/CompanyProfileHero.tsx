import Link from 'next/link';
import { Button } from '@jobportal/ui';
import { ArrowRight, Briefcase, Building2, ExternalLink, MapPin, Users } from '@jobportal/ui/icons';
import { CompanyLogo } from './CompanyLogo';
import { CompanyShareButton } from './CompanyShareButton';
import { CompanyStatStrip } from './CompanyStatStrip';
import { RatingStars } from './RatingStars';
import { VerifiedBadge } from './VerifiedBadge';
import { companyTypeLabel, hostOf } from './company-format';

export interface CompanyProfileHeroProps {
  id: number;
  name: string;
  logoUrl: string | null;
  industryName: string | null;
  companyType: string | null;
  hqCityName: string | null;
  employeeCount: string | null;
  foundedYear: number | null;
  websiteUrl: string | null;
  averageRating: number | null;
  reviewCount: number;
  activeJobs: number;
  isVerified: boolean;
  /** Absolute canonical URL — used by the share affordance. */
  canonicalUrl: string;
  /** `/working-at-<slug>-<id>` is rendered only when a slug is present. */
  workingAtSlug: string | null;
}

// Premium, content-first company header — LinkedIn information density with
// Stripe/Linear restraint. Identity + trust + facts + primary actions above
// the fold, then a real-metrics stat strip. Flat surfaces, borders over
// shadows, one accent (CLAUDE.md §2).
export function CompanyProfileHero({
  id,
  name,
  logoUrl,
  industryName,
  companyType,
  hqCityName,
  employeeCount,
  foundedYear,
  websiteUrl,
  averageRating,
  reviewCount,
  activeJobs,
  isVerified,
  canonicalUrl,
  workingAtSlug,
}: CompanyProfileHeroProps) {
  const typeLabel = companyTypeLabel(companyType);

  return (
    <section
      id="overview"
      aria-label={`${name} overview`}
      className="scroll-mt-24 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 sm:p-6"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <CompanyLogo companyId={id} name={name} logoUrl={logoUrl} size={88} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-3xl">
              {name}
            </h1>
            {isVerified && <VerifiedBadge className="translate-y-0.5" />}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--color-fg-muted)]">
            {industryName && <span>{industryName}</span>}
            {industryName && typeLabel && (
              <span aria-hidden="true" className="text-[var(--color-fg-subtle)]">
                ·
              </span>
            )}
            {typeLabel && <span>{typeLabel}</span>}
          </div>

          <div className="mt-2.5">
            <RatingStars rating={averageRating} reviewCount={reviewCount} size="md" />
          </div>
        </div>

        {/* Primary actions — right-aligned on desktop, full-width row on mobile. */}
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <CompanyShareButton companyName={name} url={canonicalUrl} />
          <Button asChild variant="primary">
            <a href="#openings">
              <Briefcase className="size-4" aria-hidden="true" />
              <span>View jobs</span>
            </a>
          </Button>
        </div>
      </div>

      {/* Fact row — the durable identifiers, icon-led. */}
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--color-border)] pt-4 text-sm text-[var(--color-fg-muted)]">
        {hqCityName && (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4 text-[var(--color-fg-subtle)]" aria-hidden="true" />
            {hqCityName}
          </span>
        )}
        {employeeCount && (
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-4 text-[var(--color-fg-subtle)]" aria-hidden="true" />
            {employeeCount} employees
          </span>
        )}
        {foundedYear !== null && (
          <span className="inline-flex items-center gap-1.5">
            <Building2 className="size-4 text-[var(--color-fg-subtle)]" aria-hidden="true" />
            Founded {foundedYear}
          </span>
        )}
        {websiteUrl && (
          <a
            href={websiteUrl}
            target="_blank"
            rel="nofollow noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-[var(--color-accent-700)] hover:underline"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            {hostOf(websiteUrl)}
          </a>
        )}
        {workingAtSlug && (
          <Link
            href={`/working-at-${workingAtSlug}-${id}`}
            className="inline-flex items-center gap-1 font-medium text-[var(--color-primary-600)] hover:underline sm:ml-auto"
          >
            Why work here
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>

      {/* Real, derived metrics. */}
      <div className="mt-5">
        <CompanyStatStrip
          activeJobs={activeJobs}
          averageRating={averageRating}
          reviewCount={reviewCount}
        />
      </div>
    </section>
  );
}
