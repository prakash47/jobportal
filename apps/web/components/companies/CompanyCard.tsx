import Link from 'next/link';
import { Briefcase, MapPin, ChevronRight } from '@jobportal/ui/icons';
import { CompanyLogo } from './CompanyLogo';
import { RatingStars } from './RatingStars';

export interface CompanyCardProps {
  id: number;
  name: string;
  slug: string;
  logoUrl: string | null;
  industryName: string | null;
  hqCityName: string | null;
  averageRating: number | null;
  reviewCount: number;
  openingsCount: number;
}

// Redesigned directory tile — a single whole-card <Link> (fully clickable),
// content-first with generous whitespace, borders over shadows (one subtle
// hover-lift for elevation). Equal-height in the grid via `h-full` + `mt-auto`
// footer. Brand colours only (navy hover, cyan open-roles accent), no gradients.
export function CompanyCard({
  id,
  name,
  slug,
  logoUrl,
  industryName,
  hqCityName,
  averageRating,
  reviewCount,
  openingsCount,
}: CompanyCardProps) {
  // Always link via the persisted slug (matches the canonical company URL).
  const canonicalHref = `/company/${slug}-overview-${id}`;
  const hiring = openingsCount > 0;

  return (
    <Link
      href={canonicalHref}
      className="card-lift group flex h-full flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] hover:border-[var(--color-border-strong)]"
    >
      <div className="flex items-start gap-3.5">
        <CompanyLogo companyId={id} name={name} logoUrl={logoUrl} size={52} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-[var(--color-fg)] transition-colors group-hover:text-[var(--color-primary-700)]">
            <span className="line-clamp-2">{name}</span>
          </h3>
          <p className="mt-0.5 line-clamp-1 text-xs text-[var(--color-fg-muted)]">
            {industryName ?? 'Industry not set'}
          </p>
        </div>
        <ChevronRight
          className="size-4 shrink-0 -translate-x-1 text-[var(--color-fg-subtle)] opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
          aria-hidden="true"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--color-fg-muted)]">
        {hqCityName && (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-3.5" aria-hidden="true" />
            {hqCityName}
          </span>
        )}
        <RatingStars rating={averageRating} reviewCount={reviewCount} />
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--color-border)] pt-3.5">
        <span className="inline-flex items-center gap-1.5 text-xs">
          <Briefcase
            className={hiring ? 'size-3.5 text-[var(--color-accent-700)]' : 'size-3.5 text-[var(--color-fg-muted)]'}
            aria-hidden="true"
          />
          {hiring ? (
            <span className="font-semibold text-[var(--color-accent-700)]">
              {openingsCount} open {openingsCount === 1 ? 'role' : 'roles'}
            </span>
          ) : (
            <span className="text-[var(--color-fg-muted)]">No open roles</span>
          )}
        </span>
        <span className="text-xs font-medium text-[var(--color-fg-muted)] transition-colors group-hover:text-[var(--color-primary-700)]">
          View company
        </span>
      </div>
    </Link>
  );
}
