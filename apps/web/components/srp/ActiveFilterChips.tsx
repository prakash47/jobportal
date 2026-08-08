'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { X } from '@jobportal/ui/icons';
// Direct path (NOT the lib/srp barrel) — the barrel re-exports Prisma-touching
// helpers; importing it in a client component drags server code into the bundle.
import { buildSrpHref, readSelections, type SrpHrefInput } from '@jobportal/domain/srp-params';
import { EMPLOYMENT_LABELS } from '../../lib/job/format';
import type { FilterOption } from './FilterSidebar';

const WORK_MODE_LABELS: Record<string, string> = {
  'on-site': 'On-site',
  hybrid: 'Hybrid',
  remote: 'Remote',
};

const POSTED_LABELS: Record<number, string> = {
  1: 'Last 24 hours',
  7: 'Last 7 days',
  30: 'Last 30 days',
};

export interface ActiveFilterChipsProps {
  basePath: string;
  skills: FilterOption[];
  cities: FilterOption[];
  industries: FilterOption[];
}

// A removable chip for every active query filter, plus "Clear all". Reads the
// current selections from the URL and, for each chip, links to the canonical
// URL with just that value removed (the search query `q` is preserved — it is
// the search, not a filter). Path-bound facets (skill on /[skill]-jobs, city on
// /jobs-in-[city]) live in the route, not the query, so they never appear here.
export function ActiveFilterChips({ basePath, skills, cities, industries }: ActiveFilterChipsProps) {
  const searchParams = useSearchParams();
  const sel = readSelections(searchParams);
  const q = searchParams.get('q') ?? undefined;

  const skillName = new Map(skills.map((s) => [s.slug, s.name]));
  const cityName = new Map(cities.map((c) => [c.slug, c.name]));
  const industryName = new Map(industries.map((i) => [i.slug, i.name]));

  function hrefWith(patch: Partial<SrpHrefInput>): string {
    return buildSrpHref(basePath, {
      q,
      skillSlugs: sel.skill,
      citySlugs: sel.city,
      industrySlug: sel.industry ?? undefined,
      emp: sel.emp,
      mode: sel.mode,
      minExperienceMonths: sel.expMin !== null ? sel.expMin * 12 : undefined,
      maxExperienceMonths: sel.expMax !== null ? sel.expMax * 12 : undefined,
      salaryMin: sel.salaryMin ?? undefined,
      postedWithinDays: sel.postedWithin ?? undefined,
      sort: sel.sort,
      page: undefined,
      ...patch,
    });
  }

  const chips: Array<{ key: string; label: string; href: string }> = [];

  for (const slug of sel.skill) {
    chips.push({
      key: `skill-${slug}`,
      label: skillName.get(slug) ?? slug,
      href: hrefWith({ skillSlugs: sel.skill.filter((s) => s !== slug) }),
    });
  }
  for (const slug of sel.city) {
    chips.push({
      key: `city-${slug}`,
      label: cityName.get(slug) ?? slug,
      href: hrefWith({ citySlugs: sel.city.filter((c) => c !== slug) }),
    });
  }
  if (sel.industry) {
    chips.push({
      key: 'industry',
      label: industryName.get(sel.industry) ?? sel.industry,
      href: hrefWith({ industrySlug: undefined }),
    });
  }
  for (const value of sel.emp) {
    chips.push({
      key: `emp-${value}`,
      label: EMPLOYMENT_LABELS[value] ?? value,
      href: hrefWith({ emp: sel.emp.filter((e) => e !== value) }),
    });
  }
  for (const value of sel.mode) {
    chips.push({
      key: `mode-${value}`,
      label: WORK_MODE_LABELS[value] ?? value,
      href: hrefWith({ mode: sel.mode.filter((m) => m !== value) }),
    });
  }
  if (sel.expMin !== null || sel.expMax !== null) {
    const label =
      sel.expMin !== null && sel.expMax !== null
        ? `${sel.expMin}–${sel.expMax} yrs`
        : sel.expMin !== null
          ? `${sel.expMin}+ yrs`
          : `Up to ${sel.expMax} yrs`;
    chips.push({
      key: 'experience',
      label,
      href: hrefWith({ minExperienceMonths: undefined, maxExperienceMonths: undefined }),
    });
  }
  if (sel.salaryMin !== null) {
    const lakhs = Math.round(sel.salaryMin / 100_000_00);
    chips.push({ key: 'salary', label: `₹${lakhs}L+`, href: hrefWith({ salaryMin: undefined }) });
  }
  if (sel.postedWithin !== null) {
    chips.push({
      key: 'posted',
      label: POSTED_LABELS[sel.postedWithin] ?? 'Recent',
      href: hrefWith({ postedWithinDays: undefined }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href}
          scroll={false}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-accent-50)] py-1 pl-3 pr-2 text-xs font-medium text-[var(--color-primary-700)] transition-colors hover:border-[var(--color-border-strong)]"
        >
          <span className="max-w-[12rem] truncate">{chip.label}</span>
          <X className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="sr-only">Remove filter {chip.label}</span>
        </Link>
      ))}
      {chips.length > 1 && (
        <Link
          href={buildSrpHref(basePath, { q })}
          scroll={false}
          className="ml-1 text-xs font-medium text-[var(--color-fg-muted)] underline-offset-2 hover:text-[var(--color-fg)] hover:underline"
        >
          Clear all
        </Link>
      )}
    </div>
  );
}
