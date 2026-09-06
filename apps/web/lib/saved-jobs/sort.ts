// Sort vocabulary for the saved-jobs list.
//
// Outside the toolbar component on purpose, exactly as lib/applications/sort.ts
// is: `'use client'` marks every export of a module client-only, and the server
// page needs readSort() to build its Prisma orderBy. That mistake cost a
// runtime error on the applications toolbar — "Attempted to call readSort()
// from the server" — and tsc cannot see it, because it is a Next.js boundary
// rule rather than a type rule. This file exists so it is not repeated.

export const SORT_OPTIONS = [
  { value: 'recent', label: 'Recently saved' },
  { value: 'oldest', label: 'Oldest saved' },
  { value: 'company', label: 'Company A–Z' },
  { value: 'title', label: 'Job title A–Z' },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]['value'];

export const DEFAULT_SORT: SortValue = 'recent';

/** Narrow an untrusted `?sort=` to a known option; anything else falls back. */
export function readSort(raw: string | null | undefined): SortValue {
  return SORT_OPTIONS.some((o) => o.value === raw) ? (raw as SortValue) : DEFAULT_SORT;
}
