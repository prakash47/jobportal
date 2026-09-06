// Sort vocabulary for the applications list.
//
// This lives OUTSIDE the toolbar component on purpose. `'use client'` marks
// every export of a module as client-only, so when these constants sat in
// ApplicationsToolbar.tsx the server page's `readSort()` call failed at runtime
// with "Attempted to call readSort() from the server but readSort is on the
// client" — a boundary error `tsc` cannot see, because it is a Next.js rule
// rather than a type one.
//
// Both sides need this: the client toolbar to render the <select> and mark the
// current option, the server page to turn ?sort= into a Prisma orderBy. Keeping
// it in one shared, boundary-free module is what stops the two from drifting.

export const SORT_OPTIONS = [
  { value: 'recent', label: 'Recent first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'company', label: 'Company A–Z' },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]['value'];

export const DEFAULT_SORT: SortValue = 'recent';

/**
 * Narrow an untrusted `?sort=` to a known option.
 *
 * Anything unrecognised — a typo, a hand-edited URL, a stale link from a future
 * version — falls back to the default rather than erroring, mirroring how
 * `readStatus` treats an unknown status.
 */
export function readSort(raw: string | null | undefined): SortValue {
  return SORT_OPTIONS.some((o) => o.value === raw) ? (raw as SortValue) : DEFAULT_SORT;
}
