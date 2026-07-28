// Shared source of truth for the recruiter Jobs-list `?sort=` and `?perPage=`
// params. The server page (which parses the URL and builds the Prisma query)
// and the client controls (sortable column headers, mobile sort select,
// pagination bar) import from here so the two sides can never drift — same
// pattern as ./applicant-filter. Side-effect-free; safe on server and client.

/**
 * Sort keys follow the repo convention: the direction is baked into the value
 * (there is no separate `dir` param anywhere in the codebase) and the default
 * is omitted from URLs entirely.
 */
export type JobsSortKey =
  | 'posted_desc'
  | 'posted_asc'
  | 'title_asc'
  | 'title_desc'
  | 'status_asc'
  | 'status_desc';

/** Newest first — the list's historical behaviour, kept as the default. */
export const JOBS_SORT_DEFAULT: JobsSortKey = 'posted_desc';

/** The three sortable columns. */
export type JobsSortColumn = 'posted' | 'title' | 'status';

/**
 * Per-column sort keys. `initial` is the direction applied when the user first
 * clicks an inactive column header (dates read best newest-first; text and
 * status read best ascending); clicking the active column flips direction.
 */
export const JOBS_SORT_COLUMNS: Record<
  JobsSortColumn,
  { asc: JobsSortKey; desc: JobsSortKey; initial: JobsSortKey }
> = {
  posted: { asc: 'posted_asc', desc: 'posted_desc', initial: 'posted_desc' },
  title: { asc: 'title_asc', desc: 'title_desc', initial: 'title_asc' },
  status: { asc: 'status_asc', desc: 'status_desc', initial: 'status_asc' },
};

/**
 * Option labels for the mobile "Sort by" select (the card layout has no column
 * headers to click). Status order is the enum's lifecycle order — Draft →
 * Under review → Open → Expired → Closed (see the page's ORDER_BY note).
 */
export const JOBS_SORT_LABELS: Record<JobsSortKey, string> = {
  posted_desc: 'Date posted (newest first)',
  posted_asc: 'Date posted (oldest first)',
  title_asc: 'Job title (A–Z)',
  title_desc: 'Job title (Z–A)',
  status_asc: 'Status (Draft first)',
  status_desc: 'Status (Closed first)',
};

/** Render order for the sort select options. */
export const JOBS_SORT_ORDER: readonly JobsSortKey[] = [
  'posted_desc',
  'posted_asc',
  'title_asc',
  'title_desc',
  'status_asc',
  'status_desc',
];

const VALID_SORTS: ReadonlySet<string> = new Set(JOBS_SORT_ORDER);

/** Narrow an untrusted `?sort=` value to a known key, else the default. */
export function parseJobsSort(raw: string | string[] | undefined | null): JobsSortKey {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && VALID_SORTS.has(value) ? (value as JobsSortKey) : JOBS_SORT_DEFAULT;
}

/**
 * Results-per-page allow-list. `?perPage=` is validated against this set
 * server-side so an arbitrary value can never inflate the Prisma `take`.
 */
export const PER_PAGE_OPTIONS = [10, 20, 50] as const;
export type PerPage = (typeof PER_PAGE_OPTIONS)[number];
/** Matches the list's historical fixed page size. */
export const PER_PAGE_DEFAULT: PerPage = 20;

/** Narrow an untrusted `?perPage=` value to an allowed size, else the default. */
export function parsePerPage(raw: string | string[] | undefined | null): PerPage {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  return (PER_PAGE_OPTIONS as readonly number[]).includes(n) ? (n as PerPage) : PER_PAGE_DEFAULT;
}
