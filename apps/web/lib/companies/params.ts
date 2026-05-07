// Pure URL-param parsers for the /companies directory. Mirrors the shape of
// lib/srp/params so a future refactor can share helpers if it pays its way.

export interface DirectoryParams {
  category: string | null; // industry slug, lowercased; null = no filter
  page: number; // 1-indexed
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseDirectoryParams(
  sp: Record<string, string | string[] | undefined>,
): DirectoryParams {
  const rawCategory = Array.isArray(sp['category']) ? sp['category'][0] : sp['category'];
  const category = rawCategory && SLUG_RE.test(rawCategory) ? rawCategory : null;

  const rawPage = Array.isArray(sp['page']) ? sp['page'][0] : sp['page'];
  const n = Number(rawPage);
  const page = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;

  return { category, page };
}
