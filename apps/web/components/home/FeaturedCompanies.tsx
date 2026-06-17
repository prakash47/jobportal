import Link from 'next/link';
import { Star } from '@jobportal/ui/icons';
import type { FeaturedCompany } from '../../lib/home/queries';
import { CompanyLogo } from '../companies/CompanyLogo';
import { SectionHeading } from './SectionHeading';
import { Reveal } from './Reveal';

interface Props {
  companies: FeaturedCompany[];
}

const fmt = (n: number) => n.toLocaleString('en-IN');

export function FeaturedCompanies({ companies }: Props) {
  if (companies.length === 0) return null;

  return (
    <section className="border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
      <div className="mx-auto w-full max-w-[var(--container-max)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <SectionHeading
          eyebrow="Employers"
          title="Companies hiring now"
          description="Top-rated teams with open roles this week."
          cta={{ label: 'All companies', href: '/companies' }}
        />
        <Reveal>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {companies.map((c, index) => (
              <li key={c.id}>
                <Link
                  href={`/company/${c.slug}-overview-${c.id}`}
                  className="glass card-lift group relative flex h-full items-start gap-3 overflow-hidden rounded-xl p-4"
                >
                  {/* Spotlight the single highest-rated company (already sorted). */}
                  {index === 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 top-0 h-0.5"
                      style={{ background: 'var(--gradient-brand)' }}
                    />
                  )}
                  <CompanyLogo companyId={c.id} name={c.name} logoUrl={c.logoUrl} size={48} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-[var(--color-fg)]">
                      {c.name}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-[var(--color-fg-muted)]">
                      {[c.industryName, c.hqCityName].filter(Boolean).join(' · ') || ' '}
                    </div>
                    {c.averageRating != null && (
                      <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-[var(--color-fg-subtle)]">
                        <Star className="size-3.5 text-[var(--color-warning)]" aria-hidden="true" />
                        <span className="tabular-nums text-[var(--color-fg-muted)]">
                          {c.averageRating.toFixed(1)}
                        </span>
                        {c.reviewCount > 0 && (
                          <span className="tabular-nums">({fmt(c.reviewCount)})</span>
                        )}
                      </span>
                    )}
                    <div className="mt-2 text-xs text-[var(--color-fg-subtle)]">
                      {c.openingsCount > 0 ? (
                        <>
                          <span className="tabular-nums">{fmt(c.openingsCount)}</span> open{' '}
                          {c.openingsCount === 1 ? 'role' : 'roles'}
                        </>
                      ) : (
                        'Profile'
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
