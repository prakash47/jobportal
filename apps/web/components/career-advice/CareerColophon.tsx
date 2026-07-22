import Link from 'next/link';
import { ArrowRight, Bell, Briefcase } from '@jobportal/ui/icons';

export interface ColophonArchiveItem {
  slug: string;
  title: string;
}

export interface CareerColophonProps {
  /** Extra stories not on the current screen; the "archive" list renders only
   *  when non-empty, so it never just repeats the visible articles. */
  archive?: ColophonArchiveItem[];
}

// The magazine's back page: a flat deep-navy (#192249-family) closing band that
// pairs the one real cross-product CTA (jobs / alerts) with a conditional
// archive list. Reuses the same flat SVG dot texture as the cover plates so the
// page has one unified visual language. No gradient, no glow.
export function CareerColophon({ archive = [] }: CareerColophonProps) {
  const hasArchive = archive.length > 0;

  return (
    <section
      aria-label="Keep going"
      className="relative overflow-hidden rounded-2xl border border-[var(--color-primary-700)] bg-[var(--color-primary-900)] p-6 sm:p-8"
    >
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full">
        <defs>
          <pattern id="colophon-dots" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.3" fill="rgba(255,255,255,0.08)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#colophon-dots)" />
      </svg>

      <div className={`relative grid gap-8 ${hasArchive ? 'lg:grid-cols-2' : ''}`}>
        <div className="max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent-400)]">
            Advice into action
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Ready to apply?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-primary-100)]">
            Put what you&rsquo;ve read to work — find roles that match your skills, and get alerted
            when new ones open.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/jobs"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[var(--color-primary-700)] transition-colors hover:bg-[var(--color-primary-100)]"
            >
              <Briefcase className="size-4" aria-hidden="true" />
              Browse jobs
            </Link>
            <Link
              href="/alerts/new"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
            >
              <Bell className="size-4" aria-hidden="true" />
              Set a job alert
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>

        {hasArchive && (
          <div className="lg:justify-self-end">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent-400)]">
              More in the archive
            </h2>
            <ul className="mt-3 space-y-2.5">
              {archive.map((a) => (
                <li key={a.slug}>
                  <Link
                    href={`/career-advice/${a.slug}`}
                    className="text-sm font-medium leading-snug text-[var(--color-primary-100)] transition-colors hover:text-white hover:underline"
                  >
                    {a.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
