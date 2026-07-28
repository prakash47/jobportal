// Open-redirect defence for the ?next= login redirect. Same shape as the
// apps/web and apps/recruiter variants — trust only single-slash same-origin
// paths, rejecting protocol-relative ('//evil.com'), absolute URLs, and the
// backslash variants browsers may normalise.
//
// basePath note: values here are basePath-RELATIVE (the middleware reports
// pathnames with '/sadmin' already stripped, and router.push re-applies it), so
// a stored next of '/dashboard' is correct and '/sadmin/dashboard' would be a
// bug that resolves to /sadmin/sadmin/dashboard.

export function safeNext(raw: string | null | undefined): string {
  if (!raw) return '/dashboard';
  if (typeof raw !== 'string') return '/dashboard';
  if (!raw.startsWith('/')) return '/dashboard';
  if (raw.startsWith('//')) return '/dashboard';
  if (raw.startsWith('/\\')) return '/dashboard';
  return raw;
}
