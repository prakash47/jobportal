import Link from 'next/link';
import { ArrowRight } from '@jobportal/ui/icons';
import type { RoleItem } from '../../lib/home/queries';
import { SectionHeading } from './SectionHeading';

interface Props {
  roles: RoleItem[];
}

// Role tiles link to the SRP full-text search (?q=<role>). Job titles are
// freeform, so roles are bucketed by title keyword in the query layer (see
// ROLE_DEFS). Structural inspiration from Naukri's "Discover jobs across
// popular roles" grid.

const fmt = (n: number) => n.toLocaleString('en-IN');

export function RolesGrid({ roles }: Props) {
  if (roles.length === 0) return null;

  return (
    <section className="border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
      <div className="mx-auto w-full max-w-[var(--container-max)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <SectionHeading
          eyebrow="Roles"
          title="Discover jobs by role"
          description="Pick a role and we'll show you every matching opening."
          cta={{ label: 'Browse all roles', href: '/jobs' }}
        />
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((r) => (
            <li key={r.label}>
              <Link
                href={`/jobs?q=${encodeURIComponent(r.query)}`}
                className="group flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3.5 transition-colors hover:border-[var(--color-primary-300)] hover:bg-[var(--color-primary-50)]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[var(--color-fg)]">
                    {r.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--color-fg-muted)]">
                    {fmt(r.jobCount)} {r.jobCount === 1 ? 'job' : 'jobs'}
                  </span>
                </span>
                <ArrowRight
                  className="size-4 shrink-0 text-[var(--color-fg-subtle)] transition-colors group-hover:text-[var(--color-primary-600)]"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
