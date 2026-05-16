import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@jobportal/ui';
import { Building2, MapPin } from '@jobportal/ui/icons';
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

// Stripe-style customer-page tile: confident, content-first, generous
// whitespace. No gradient, no drop shadow (just border).
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
  // Always link via the persisted slug. buildCompanySlug() (in lib/url/slug)
  // would re-derive from the name, which can drift after a rename — the
  // server-side redirect in app/company/[skill]-overview-[city]/page.tsx
  // fixes drift but the directory should already point at the canonical URL.
  const canonicalHref = `/company/${slug}-overview-${id}`;

  return (
    <Card className="transition-colors hover:border-[var(--color-border-strong)]">
      <CardHeader className="gap-2">
        <div className="flex items-start gap-3">
          <CompanyLogo companyId={id} name={name} logoUrl={logoUrl} size={48} />
          <div className="min-w-0">
            <Link
              href={canonicalHref}
              className="text-base font-semibold leading-tight tracking-tight text-[var(--color-fg)] hover:underline"
            >
              {name}
            </Link>
            <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">
              {industryName ?? 'Industry not set'}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--color-fg-muted)]">
          {hqCityName && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5" aria-hidden="true" />
              {hqCityName}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Building2 className="size-3.5" aria-hidden="true" />
            {openingsCount === 0
              ? 'No openings'
              : `${openingsCount} ${openingsCount === 1 ? 'opening' : 'openings'}`}
          </span>
          <span className="ml-auto">
            <RatingStars rating={averageRating} reviewCount={reviewCount} />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
