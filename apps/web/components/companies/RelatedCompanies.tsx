import Link from 'next/link';
import { CompanyLogo } from './CompanyLogo';

export interface RelatedCompany {
  id: number;
  slug: string;
  name: string;
  logoUrl: string | null;
  averageRating: number | null;
  openRoles: number;
}

export interface RelatedCompaniesProps {
  peers: RelatedCompany[];
  industryName: string | null;
  className?: string;
}

// Pure presentational rail of same-industry peers. The query lives in the
// page (one lookup, reused at every breakpoint) so this renders in both the
// desktop sidebar and the mobile inline flow without re-hitting the DB.
// Renders nothing when there are no peers.
export function RelatedCompanies({ peers, industryName, className }: RelatedCompaniesProps) {
  if (peers.length === 0) return null;

  return (
    <section
      aria-label="Similar companies"
      className={
        'rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4' +
        (className ? ` ${className}` : '')
      }
    >
      <h2 className="text-sm font-semibold text-[var(--color-fg)]">
        {industryName ? `More in ${industryName}` : 'Similar companies'}
      </h2>
      <ul className="mt-3 space-y-1">
        {peers.map((p) => (
          <li key={p.id}>
            <Link
              href={`/company/${p.slug}-overview-${p.id}`}
              className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-[var(--color-bg-muted)]"
            >
              <CompanyLogo companyId={p.id} name={p.name} logoUrl={p.logoUrl} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[var(--color-fg)]">
                  {p.name}
                </span>
                <span className="mt-0.5 flex items-center gap-2 text-xs text-[var(--color-fg-muted)]">
                  {p.averageRating !== null && (
                    <span className="inline-flex items-center gap-0.5 tabular-nums">
                      <span aria-hidden="true" className="text-[oklch(0.75_0.15_80)]">
                        ★
                      </span>
                      {p.averageRating.toFixed(1)}
                    </span>
                  )}
                  {p.openRoles > 0 && (
                    <span>
                      {p.openRoles} open {p.openRoles === 1 ? 'role' : 'roles'}
                    </span>
                  )}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
