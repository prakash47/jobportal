import Link from 'next/link';
import type { PopularItem } from '../../lib/home/queries';
import { SectionHeading } from './SectionHeading';

interface Props {
  skills: PopularItem[];
}

// Same href-target rationale as PopularCitiesGrid: `/jobs?skill=<slug>`
// instead of `/<slug>-jobs` SEO landing, until chip #5 lands. Skill tiles
// are denser than city tiles (no icon — keeps the row compact, helps the
// type breathe).

const fmt = (n: number) => n.toLocaleString('en-IN');

export function PopularSkillsGrid({ skills }: Props) {
  if (skills.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-[var(--container-max)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <SectionHeading
        eyebrow="Skills"
        title="In-demand right now"
        description="The skills companies are hiring against this week."
        cta={{ label: 'All filters', href: '/jobs' }}
      />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {skills.map((s) => (
          <li key={s.slug}>
            <Link
              href={`/jobs?skill=${encodeURIComponent(s.slug)}`}
              className="group flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-3 transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-muted)]"
            >
              <span className="truncate text-sm font-medium text-[var(--color-fg)]">
                {s.name}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-[var(--color-fg-muted)]">
                {fmt(s.jobCount)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
