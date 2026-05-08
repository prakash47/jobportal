// Open-redirect defense for the ?next= login redirect. Same shape as the
// apps/web variant — both apps trust only single-slash same-origin paths,
// rejecting protocol-relative ('//evil.com'), absolute URLs, and backslash
// variants browsers may normalise.

export function safeNext(raw: string | null | undefined): string {
  if (!raw) return '/';
  if (typeof raw !== 'string') return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//')) return '/';
  if (raw.startsWith('/\\')) return '/';
  return raw;
}
