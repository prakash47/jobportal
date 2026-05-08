// Pure URL-param parser for /career-advice. Mirrors the shape of
// lib/companies/params and lib/srp/params for consistency.

export interface ArticleIndexParams {
  tag: string | null; // tag slug (lowercase); null = no filter
  page: number; // 1-indexed
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseArticleIndexParams(
  sp: Record<string, string | string[] | undefined>,
): ArticleIndexParams {
  const rawTag = Array.isArray(sp['tag']) ? sp['tag'][0] : sp['tag'];
  const tag = rawTag && SLUG_RE.test(rawTag) ? rawTag : null;

  const rawPage = Array.isArray(sp['page']) ? sp['page'][0] : sp['page'];
  const n = Number(rawPage);
  const page = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;

  return { tag, page };
}
