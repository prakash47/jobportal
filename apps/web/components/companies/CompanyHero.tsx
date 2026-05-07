import Link from 'next/link';
import { Badge } from '@jobportal/ui';
import { Building2, MapPin, Users } from '@jobportal/ui/icons';
import { CompanyLogo } from './CompanyLogo';
import { RatingStars } from './RatingStars';

export interface CompanyHeroProps {
  id: number;
  name: string;
  logoUrl: string | null;
  industryName: string | null;
  hqCityName: string | null;
  employeeCount: string | null;
  foundedYear: number | null;
  websiteUrl: string | null;
  averageRating: number | null;
  reviewCount: number;
  workingAtSlug: string | null;
}

// Confident, content-first profile hero — Stripe customer-page energy.
// No gradient header, no drop shadow, no overlap with photos. Borders +
// type weight do the work.
export function CompanyHero({
  id,
  name,
  logoUrl,
  industryName,
  hqCityName,
  employeeCount,
  foundedYear,
  websiteUrl,
  averageRating,
  reviewCount,
  workingAtSlug,
}: CompanyHeroProps) {
  return (
    <section className="space-y-4 border-b border-[var(--color-border)] pb-8">
      <div className="flex items-start gap-5">
        <CompanyLogo companyId={id} name={name} logoUrl={logoUrl} size={88} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-3xl">
            {name}
          </h1>
          {industryName && (
            <p className="mt-0.5 text-sm text-[var(--color-fg-muted)]">{industryName}</p>
          )}
          <div className="mt-3">
            <RatingStars rating={averageRating} reviewCount={reviewCount} size="md" />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[var(--color-fg-muted)]">
        {hqCityName && (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4" aria-hidden="true" />
            {hqCityName}
          </span>
        )}
        {employeeCount && (
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-4" aria-hidden="true" />
            {employeeCount}
          </span>
        )}
        {foundedYear !== null && (
          <span className="inline-flex items-center gap-1.5">
            <Building2 className="size-4" aria-hidden="true" />
            Founded {foundedYear}
          </span>
        )}
        {websiteUrl && (
          <a
            href={websiteUrl}
            target="_blank"
            rel="nofollow noopener noreferrer"
            className="ml-auto text-[var(--color-fg)] hover:underline"
          >
            Website ↗
          </a>
        )}
      </div>

      {workingAtSlug && (
        <div className="pt-1">
          <Link
            href={`/working-at-${workingAtSlug}-${id}`}
            className="inline-flex items-center text-sm font-medium text-[var(--color-primary-600)] hover:underline"
          >
            Why work at {name} →
          </Link>
          <Badge variant="neutral" className="ml-2 align-middle">
            Working at
          </Badge>
        </div>
      )}
    </section>
  );
}
