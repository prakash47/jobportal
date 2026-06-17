import Link from 'next/link';
import { cn } from '@jobportal/ui';
import type { PopularItem } from '../../lib/home/queries';
import { SectionHeading } from './SectionHeading';
import { Reveal } from './Reveal';

interface Props {
  skills: PopularItem[];
}

// Tag-cloud that rhymes the hero quick-filter chips. Glass chips on the neutral
// band; the top 3 highest-count skills wear a faint brand-soft tint for
// hierarchy. Color-only hover (no lift) keeps it airy at density.

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
      <Reveal>
        <ul className="flex flex-wrap gap-2.5">
          {skills.map((s, index) => (
            <li key={s.slug}>
              <Link
                href={`/jobs?skill=${encodeURIComponent(s.slug)}`}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border border-white/60 px-3 py-1.5 text-sm font-medium transition-colors hover:border-[var(--color-primary-300)] hover:bg-[image:var(--gradient-brand-soft)] hover:text-[var(--color-primary-700)]',
                  index < 3
                    ? 'bg-[image:var(--gradient-brand-soft)] text-[var(--color-primary-700)]'
                    : 'bg-white/80 text-[var(--color-fg-muted)]',
                )}
              >
                {s.name}
                <span className="text-xs tabular-nums text-[var(--color-fg-subtle)]">
                  {fmt(s.jobCount)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
