// Open-redirect defense for the ?next= login redirect.
// Returns the input only when it is a same-origin path; falls back to '/'
// otherwise. Used both client-side (login page after success) and any
// future server-side redirect that consumes the same query param.

export function safeNext(raw: string | null | undefined): string {
  if (!raw) return '/';
  if (typeof raw !== 'string') return '/';
  if (!raw.startsWith('/')) return '/';
  // Protocol-relative URLs like //evil.com — browsers treat as cross-origin.
  if (raw.startsWith('//')) return '/';
  // Backslash variants some browsers normalise back to '//'.
  if (raw.startsWith('/\\')) return '/';
  return raw;
}
