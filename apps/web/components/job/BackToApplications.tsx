import Link from 'next/link';
import { ArrowLeft } from '@jobportal/ui/icons';

// "Back to applications" for the job and company detail pages.
//
// CONDITIONAL ON PURPOSE. Both pages are PUBLIC — most of their traffic arrives
// from Google, the search results page, or a shared link, and those visitors
// have no applications list to go back to. An unconditional back link would be
// a dead end for the majority to serve a minority, so it renders only when the
// visitor actually came from /applications, marked by `?from=applications` on
// the links in ApplicationRow.
//
// `from` was chosen over `ref` deliberately: `ref` is in TRACKING_PARAMS
// (url/normalize.ts) and the middleware 301s those out of the URL before the
// page ever sees them, so a `?ref=` marker would have silently vanished. `from`
// is instead excluded from the CANONICAL only (see lib/seo/canonical.ts), so it
// survives the round trip without giving one posting two canonical URLs.
//
// Server component: no interactivity, and it must be in the first paint rather
// than appearing after hydration.

/** The only origins that get a back link. Unknown values render nothing. */
const KNOWN_ORIGINS = {
  applications: { href: '/applications', label: 'Back to applications' },
} as const;

export function BackToApplications({ from }: { from?: string | undefined }) {
  const origin = from && from in KNOWN_ORIGINS
    ? KNOWN_ORIGINS[from as keyof typeof KNOWN_ORIGINS]
    : null;
  if (!origin) return null;

  return (
    <Link
      href={origin.href}
      className="inline-flex items-center gap-1.5 text-sm text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
    >
      <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
      {origin.label}
    </Link>
  );
}
