'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
// Direct path (NOT the lib/srp barrel) — see SrpPaginationLink for
// the barrel-vs-client-bundle rationale.
import { buildSrpHref, readSelections } from '../../lib/srp/params';

const OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'recent', label: 'Most recent' },
  { value: 'salary_desc', label: 'Salary high to low' },
] as const;

export function SortSelect({ basePath }: { basePath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sel = readSelections(searchParams);
  const [, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const sort = e.target.value as typeof OPTIONS[number]['value'];
    const href = buildSrpHref(basePath, {
      q: searchParams.get('q') ?? undefined,
      skillSlugs: sel.skill,
      citySlugs: sel.city,
      industrySlug: sel.industry ?? undefined,
      emp: sel.emp,
      mode: sel.mode,
      minExperienceMonths: sel.expMin !== null ? sel.expMin * 12 : undefined,
      maxExperienceMonths: sel.expMax !== null ? sel.expMax * 12 : undefined,
      salaryMin: sel.salaryMin ?? undefined,
      postedWithinDays: sel.postedWithin ?? undefined,
      sort,
      // page intentionally reset to 1 when sort changes.
    });
    startTransition(() => router.push(href));
  }

  return (
    <label className="flex items-center gap-2 text-sm text-[var(--color-fg-muted)]">
      <span className="hidden sm:inline">Sort by</span>
      <select
        value={sel.sort}
        onChange={onChange}
        className="h-9 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-3 text-sm text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
