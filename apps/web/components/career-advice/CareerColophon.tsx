import Link from 'next/link';
import { ArrowRight, Bell, Briefcase } from '@jobportal/ui/icons';

export interface ColophonArchiveItem {
  slug: string;
  title: string;
}

export interface CareerColophonProps {
  /** Extra stories not on the current screen; renders only when non-empty. */
  archive?: ColophonArchiveItem[];
}

// The closing band — a LIGHT cyan-tint card (no dark slab) pairing the one real
// cross-product CTA (jobs / alerts) with a conditional archive list. Elevation +
// a serif line keep it editorial.
export function CareerColophon({ archive = [] }: CareerColophonProps) {
  const hasArchive = archive.length > 0;

  return (
    <section
      aria-label="Keep going"
      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-accent-50)] p-8 shadow-[var(--shadow-card)] sm:p-11"
    >
      <div className={`grid items-center gap-8 ${hasArchive ? 'lg:grid-cols-2' : ''}`}>
        <div className="max-w-[46ch]">
          <h2 className="font-editorial text-3xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-4xl">
            Read it, then land it.
          </h2>
          <p className="mt-3 text-base leading-relaxed text-[var(--color-fg-muted)]">
            Put the advice to work — find roles that match your skills, and get alerted when new ones
            open.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/jobs"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary-600)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-700)]"
            >
              <Briefcase className="size-4" aria-hidden="true" />
              Browse jobs
            </Link>
            <Link
              href="/alerts/new"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-5 py-2.5 text-sm font-semibold text-[var(--color-fg)] transition-colors hover:bg-[var(--color-bg-muted)]"
            >
              <Bell className="size-4" aria-hidden="true" />
              Set a job alert
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>

        {hasArchive && (
          <div className="lg:justify-self-end">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent-700)]">
              More in the archive
            </h3>
            <ul className="mt-3 space-y-2.5">
              {archive.map((a) => (
                <li key={a.slug}>
                  <Link
                    href={`/career-advice/${a.slug}`}
                    className="font-editorial text-lg font-medium leading-snug text-[var(--color-fg)] transition-colors hover:text-[var(--color-primary-600)] hover:underline"
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
