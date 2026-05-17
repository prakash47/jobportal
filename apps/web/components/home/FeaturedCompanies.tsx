import Link from 'next/link';
import Image from 'next/image';
import { Building2 } from '@jobportal/ui/icons';
import type { FeaturedCompany } from '../../lib/home/queries';
import { SectionHeading } from './SectionHeading';

interface Props {
  companies: FeaturedCompany[];
}

// Company tiles. Logo block uses a bordered placeholder when logoUrl is null
// (no decorative gradient — just a calm Building2 mark). The href hits the
// canonical company-overview route already shipped in PR #20.

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
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {companies.map((c) => (
            <li key={c.id}>
              <Link
                href={`/${c.slug}-overview-${c.id}`}
                className="group flex h-full items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4 transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-muted)]"
              >
                <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
                  {c.logoUrl ? (
                    <Image
                      src={c.logoUrl}
                      alt=""
                      width={48}
                      height={48}
                      className="size-full object-cover"
                    />
                  ) : (
                    <Building2
                      className="size-5 text-[var(--color-fg-subtle)]"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-[var(--color-fg)]">
                    {c.name}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-[var(--color-fg-muted)]">
                    {[c.industryName, c.hqCityName].filter(Boolean).join(' · ') || ' '}
                  </div>
                  <div className="mt-2 text-xs text-[var(--color-fg-subtle)]">
                    {c.openingsCount > 0
                      ? `${fmt(c.openingsCount)} open ${c.openingsCount === 1 ? 'role' : 'roles'}`
                      : 'Profile'}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
