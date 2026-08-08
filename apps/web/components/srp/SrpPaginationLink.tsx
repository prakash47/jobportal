'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from '@jobportal/ui/icons';
// Direct import (NOT the lib/srp barrel) — the barrel re-exports
// loadSrpUserContext which touches Prisma and would pull node:module
// into the client bundle.
import { buildSrpHref, readSelections } from '@jobportal/domain/srp-params';

interface Props {
  basePath: string;
  page: number;
  label: string;
  active?: boolean;
  disabled?: boolean;
  arrow?: 'prev' | 'next';
}

export function SrpPaginationLink({ basePath, page, label, active, disabled, arrow }: Props) {
  const searchParams = useSearchParams();
  const sel = readSelections(searchParams);
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
    sort: sel.sort,
    page,
  });

  const cls =
    'inline-flex size-8 items-center justify-center rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 ' +
    (disabled
      ? 'cursor-not-allowed opacity-40'
      : active
        ? 'bg-[var(--color-fg)] text-[var(--color-bg)]'
        : 'hover:bg-[var(--color-bg-muted)]');

  if (disabled) {
    return (
      <span aria-disabled="true" className={cls} aria-label={label}>
        {arrow === 'prev' ? <ChevronLeft className="size-4" /> : arrow === 'next' ? <ChevronRight className="size-4" /> : label}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={arrow ? label : undefined}
      aria-current={active ? 'page' : undefined}
      prefetch={false}
      className={cls}
    >
      {arrow === 'prev' ? <ChevronLeft className="size-4" /> : arrow === 'next' ? <ChevronRight className="size-4" /> : label}
    </Link>
  );
}
