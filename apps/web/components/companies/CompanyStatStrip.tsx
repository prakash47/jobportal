export interface CompanyStatStripProps {
  activeJobs: number;
  averageRating: number | null;
  reviewCount: number;
}

interface Tile {
  label: string;
  value: React.ReactNode;
  sub?: string;
}

// At-a-glance metrics under the hero identity. Every value is real and
// derived from data already loaded on the page — no fabricated followers or
// engagement counts. Flat surface tiles, tabular figures.
export function CompanyStatStrip({ activeJobs, averageRating, reviewCount }: CompanyStatStripProps) {
  const hiring = activeJobs > 0;
  const tiles: Tile[] = [
    { label: 'Open roles', value: activeJobs.toLocaleString('en-IN') },
    {
      label: 'Rating',
      value: averageRating !== null ? averageRating.toFixed(1) : '—',
      ...(averageRating === null ? { sub: 'Not yet rated' } : {}),
    },
    { label: 'Reviews', value: reviewCount.toLocaleString('en-IN') },
    {
      label: 'Hiring status',
      value: (
        <span className="inline-flex items-center gap-1.5 text-base font-medium text-[var(--color-fg)]">
          <span
            aria-hidden="true"
            className={
              'size-2 rounded-full ' +
              (hiring ? 'bg-[var(--color-success)]' : 'bg-[var(--color-fg-subtle)]')
            }
          />
          {hiring ? 'Active' : 'Paused'}
        </span>
      ),
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg bg-[var(--color-bg-muted)] px-4 py-3">
          <dt className="text-xs text-[var(--color-fg-muted)]">{t.label}</dt>
          {/* sub text nested inside <dd> — a <div> grouping child of <dl> may
              only contain <dt>/<dd>, so it can't be a <p> sibling. */}
          <dd className="mt-1 text-2xl font-semibold tabular-nums text-[var(--color-fg)]">
            {t.value}
            {t.sub && (
              <span className="mt-0.5 block text-xs font-normal text-[var(--color-fg-muted)]">
                {t.sub}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
