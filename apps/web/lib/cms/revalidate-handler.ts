// Pure handler for the article-revalidate webhook. Lives separate from the
// route file so we can unit-test without the Next.js handler harness.
//
// Auth: Bearer <REVALIDATE_SECRET>. Token rotation lives at the env layer
// (CLAUDE.md §9 — secrets never committed). Signed-JWT replacement is
// queued as a hardening chip.

// Slug shape — same regex used by parseArticleIndexParams. apps/web doesn't
// take zod directly as a dep yet (apps/api does); a one-line manual check
// is enough for one boolean field.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseBody(body: unknown): { ok: true; slug: string } | { ok: false; reason: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, reason: 'body must be a JSON object' };
  }
  const slug = (body as Record<string, unknown>)['slug'];
  if (typeof slug !== 'string' || slug.length === 0) {
    return { ok: false, reason: 'slug is required' };
  }
  if (!SLUG_RE.test(slug)) {
    return { ok: false, reason: 'slug must be lowercase, hyphen-separated' };
  }
  return { ok: true, slug };
}

export interface RevalidateInput {
  authHeader: string | null;
  body: unknown;
  secret: string | undefined;
  /** Injected so tests don't need next/cache. */
  revalidatePath: (path: string) => void | Promise<void>;
}

export interface RevalidateResult {
  status: number;
  body: { revalidated: boolean; paths?: string[]; error?: string };
}

export async function handleRevalidate(input: RevalidateInput): Promise<RevalidateResult> {
  if (!input.secret) {
    // Misconfigured deployment — treat as 503 so an automated retry can fire
    // once the env is fixed, rather than 401 (which the caller would record
    // as a permanent auth failure).
    return { status: 503, body: { revalidated: false, error: 'REVALIDATE_SECRET not set' } };
  }
  const expected = `Bearer ${input.secret}`;
  if (input.authHeader !== expected) {
    return { status: 401, body: { revalidated: false, error: 'unauthorized' } };
  }

  const parsed = parseBody(input.body);
  if (!parsed.ok) {
    return { status: 400, body: { revalidated: false, error: parsed.reason } };
  }

  const slug = parsed.slug;
  const paths = ['/career-advice', `/career-advice/${slug}`];
  for (const p of paths) {
    await input.revalidatePath(p);
  }
  return { status: 200, body: { revalidated: true, paths } };
}
