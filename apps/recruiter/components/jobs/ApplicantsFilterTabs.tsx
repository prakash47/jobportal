'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@jobportal/ui';
import {
  APPLICANT_FILTER_ORDER,
  APPLICANT_FILTER_LABELS,
  parseApplicantFilter,
} from './applicant-filter';

// URL-driven applicant filter. Mirrors ApplicantsSortToggle: sets/clears the
// `filter` param and drops `page` on change so a deep page on the previous
// filter doesn't render a confusing empty result. Keeps any active `sort`.
const OPTIONS = [
  { value: '', label: 'All' },
  ...APPLICANT_FILTER_ORDER.map((f) => ({ value: f, label: APPLICANT_FILTER_LABELS[f] })),
] as const;

export function ApplicantsFilterTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Narrow through the same parser the server uses, so an unrecognised ?filter=
  // value highlights "All" — matching the unfiltered list the server renders.
  const current = parseApplicantFilter(searchParams.get('filter')) ?? '';

  function buildHref(value: string): string {
    const params = new URLSearchParams(searchParams.toString());
    if (value === '') params.delete('filter');
    else params.set('filter', value);
    params.delete('page');
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <div role="tablist" aria-label="Filter applicants" className="flex flex-wrap gap-1.5">
      {OPTIONS.map((o) => {
        const active = current === o.value;
        return (
          <Link
            key={o.value || 'all'}
            href={buildHref(o.value)}
            role="tab"
            aria-selected={active}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              active
                ? 'border-[var(--color-primary-600)] bg-[var(--color-primary-600)] text-white'
                : 'border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)]',
            )}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
