import Link from 'next/link';
import { Briefcase, ChevronRight } from '@jobportal/ui/icons';
import type { RoleItem } from '../../lib/home/queries';
import { SectionHeading } from './SectionHeading';
import { Reveal } from './Reveal';

interface Props {
  roles: RoleItem[];
}

// Same browse-grid card system as Industries + Cities. Sits on the neutral band.

const fmt = (n: number) => n.toLocaleString('en-IN');

export function RolesGrid({ roles }: Props) {
  if (roles.length === 0) return null;

  return (
    <section className="border-t border-[var(--color-border)]">
      <div className="mx-auto w-full max-w-[var(--container-max)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <SectionHeading
          eyebrow="Roles"
          title="Discover jobs by role"
          description="Pick a role and we'll show you every matching opening."
          cta={{ label: 'Browse all roles', href: '/jobs' }}
        />
        <Reveal>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {roles.map((r) => (
              <li key={r.label}>
                <Link
                  href={`/jobs?q=${encodeURIComponent(r.query)}`}
                  className="card-lift group flex h-full items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-card)] hover:border-[var(--color-primary-300)]"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[image:var(--gradient-brand-soft)] text-[var(--color-primary-700)]">
                    <Briefcase className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[var(--color-fg)]">
                      {r.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--color-fg-muted)]">
                      <span className="tabular-nums">{fmt(r.jobCount)}</span>{' '}
                      {r.jobCount === 1 ? 'job' : 'jobs'}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 self-center -translate-x-1 text-[var(--color-fg-subtle)] opacity-0 transition-all duration-[var(--duration-fast)] group-hover:translate-x-0 group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
