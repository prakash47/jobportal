// Pure URL-param parsers for the /companies directory. Mirrors the shape of
// lib/srp/params so a future refactor can share helpers if it pays its way.

export type DirectorySort = 'rating' | 'name' | 'reviews';

export interface DirectoryParams {
  category: string | null; // industry slug, lowercased; null = no filter
  sort: DirectorySort; // ordering of the company grid
  hiring: boolean; // true = only companies with ≥1 ACTIVE role
  page: number; // 1-indexed
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SORTS: readonly DirectorySort[] = ['rating', 'name', 'reviews'];

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseDirectoryParams(
  sp: Record<string, string | string[] | undefined>,
): DirectoryParams {
  const rawCategory = first(sp['category']);
  const category = rawCategory && SLUG_RE.test(rawCategory) ? rawCategory : null;

  const rawSort = first(sp['sort']);
  const sort: DirectorySort =
    rawSort && (SORTS as readonly string[]).includes(rawSort) ? (rawSort as DirectorySort) : 'rating';

  const rawHiring = first(sp['hiring']);
  const hiring = rawHiring === '1' || rawHiring === 'true';

  const rawPage = first(sp['page']);
  const n = Number(rawPage);
  const page = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;

  return { category, sort, hiring, page };
}

// Serialize directory params back into a query string, dropping defaults so the
// canonical URL stays clean (?sort=rating / ?hiring=0 / ?page=1 are all implied).
export function buildDirectoryQuery(params: {
  category?: string | null;
  sort?: DirectorySort;
  hiring?: boolean;
  page?: number;
}): string {
  const qs = new URLSearchParams();
  if (params.category) qs.set('category', params.category);
  if (params.sort && params.sort !== 'rating') qs.set('sort', params.sort);
  if (params.hiring) qs.set('hiring', '1');
  if (params.page && params.page > 1) qs.set('page', String(params.page));
  return qs.toString();
}
