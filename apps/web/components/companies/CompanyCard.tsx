import Link from 'next/link';
import { Star, ArrowRight } from '@jobportal/ui/icons';
import { CompanyLogo } from './CompanyLogo';

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

// "The Ledger" directory tile — a data-console company card. The signature is a
// hairline-divided <dl> of the three facts a seeker actually scans (open roles /
// rating / location), each a big tabular value stacked over a whisper uppercase
// label on a single flat navy tint. A navy "kicker tick" under the headline is a
// small brand-native mark that widens on hover. Flat brand colours only (no
// gradients), borders over shadows (one card-lift), strict WCAG AA. The whole
// card is one <Link> — the Hiring tag + footer affordance are non-interactive
// <span>s. Amber star matches RatingStars' exact value (no new token needed).
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
  const canonicalHref = `/company/${slug}-overview-${id}`;
  const hiring = openingsCount > 0;
  const ariaLabel =
    `${name}${industryName ? `, ${industryName}` : ''} — ` +
    `${openingsCount} open ${openingsCount === 1 ? 'role' : 'roles'}` +
    `${averageRating != null ? `, rated ${averageRating.toFixed(1)} out of 5` : ''}` +
    `${hqCityName ? `, ${hqCityName}` : ''}`;

  return (
    <Link
      href={canonicalHref}
      aria-label={ariaLabel}
      className="card-lift group flex h-full flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 hover:border-[var(--color-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] sm:p-6"
    >
      {/* Identity */}
      <div className="flex items-start gap-3.5">
        <CompanyLogo companyId={id} name={name} logoUrl={logoUrl} size={48} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-snug tracking-tight text-[var(--color-fg)] transition-colors group-hover:text-[var(--color-primary-700)]">
            <span className="line-clamp-2">{name}</span>
          </h3>
          <span
            aria-hidden="true"
            className="mt-2 block h-[3px] w-9 rounded-full bg-[var(--color-primary-600)] transition-[width] duration-[var(--duration-base)] ease-[var(--ease-out)] group-hover:w-12"
          />
          <p className="mt-2 line-clamp-1 text-xs text-[var(--color-fg-muted)]">
            {industryName ?? 'Industry not set'}
          </p>
        </div>
        {hiring && (
          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-[var(--color-accent-700)]">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--color-accent-600)]" />
            Hiring
          </span>
        )}
      </div>

      {/* Data console — the signature */}
      <dl className="mb-4 mt-4 grid grid-cols-3 divide-x divide-[color:var(--color-border)] rounded-lg bg-[var(--color-primary-50)] p-3">
        <div className="flex flex-col px-2.5 first:pl-0 last:pr-0 sm:px-3">
          <div className="flex h-8 items-end">
            <dd className="text-xl font-semibold leading-none tabular-nums text-[var(--color-primary-600)] sm:text-2xl">
              {openingsCount.toLocaleString('en-IN')}
            </dd>
          </div>
          <dt className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">
            {hiring ? 'Open roles' : 'No openings'}
          </dt>
        </div>

        <div className="flex flex-col px-2.5 first:pl-0 last:pr-0 sm:px-3">
          <div className="flex h-8 items-end">
            {averageRating != null ? (
              <dd
                aria-label={`Rated ${averageRating.toFixed(1)} out of 5${
                  reviewCount ? ` from ${reviewCount.toLocaleString('en-IN')} reviews` : ''
                }`}
                className="inline-flex items-center gap-1 text-lg font-semibold leading-none tabular-nums text-[var(--color-fg)]"
              >
                {averageRating.toFixed(1)}
                <Star
                  aria-hidden="true"
                  className="size-3.5 fill-[oklch(0.75_0.15_80)] text-[oklch(0.75_0.15_80)]"
                />
              </dd>
            ) : (
              <dd
                aria-label="Not yet rated"
                className="text-lg font-semibold leading-none text-[var(--color-fg-muted)]"
              >
                —
              </dd>
            )}
          </div>
          <dt className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">
            Rating
          </dt>
        </div>

        <div className="flex min-w-0 flex-col px-2.5 first:pl-0 last:pr-0 sm:px-3">
          <div className="flex h-8 min-w-0 items-end">
            <dd className="min-w-0 truncate text-sm font-medium leading-snug text-[var(--color-fg)]">
              {hqCityName ?? '—'}
            </dd>
          </div>
          <dt className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">
            Location
          </dt>
        </div>
      </dl>

      {/* Footer ghost affordance (mt-auto pins it → equal-height cards) */}
      <span className="mt-auto flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium text-[var(--color-fg-muted)] transition-colors group-hover:border-[var(--color-primary-200)] group-hover:bg-[var(--color-primary-50)] group-hover:text-[var(--color-primary-700)]">
        {hiring ? 'View jobs' : 'View company'}
        <ArrowRight
          aria-hidden="true"
          className="size-4 transition-transform duration-[var(--duration-base)] ease-[var(--ease-out)] group-hover:translate-x-0.5"
        />
      </span>
    </Link>
  );
}
