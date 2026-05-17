interface TrustStripProps {
  activeJobs: number;
  companies: number;
  recruiters: number;
}

// 3-stat strip — numbers in a heavier weight than labels, hairline dividers
// between cells. No icons (visual restraint per CLAUDE.md §2). Numbers come
// from SSR, never from copy. en-IN locale formats with Indian comma grouping
// (1,00,000 — see the project's India-first stance in CLAUDE.md §14).

const fmt = (n: number) => n.toLocaleString('en-IN');

export function TrustStrip({ activeJobs, companies, recruiters }: TrustStripProps) {
  const stats = [
    { value: activeJobs, label: 'Active jobs' },
    { value: companies, label: 'Companies hiring' },
    { value: recruiters, label: 'Hiring teams' },
  ];

  return (
    <section className="border-y border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
      <div className="mx-auto grid w-full max-w-[var(--container-max)] grid-cols-3 divide-x divide-[var(--color-border)] px-4 sm:px-6 lg:px-8">
        {stats.map((s) => (
          <div key={s.label} className="px-4 py-6 text-center sm:py-8">
            <div className="text-2xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-3xl">
              {fmt(s.value)}
            </div>
            <div className="mt-1 text-xs font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
