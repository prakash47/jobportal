// Copy for the brand aside on the public (auth) pages — the navy panel beside
// the sign-in / sign-up form (see components/auth/AuthSplit.tsx).
//
// Route-keyed and PURE on purpose: apps/recruiter's vitest only collects
// `lib/**` (vitest.config.ts), so keeping the lookup here is the only way this
// surface gets test coverage at all. No React, no request access — the layout
// reads the pathname from the `x-canonical-pathname` header the middleware
// already sets and hands the raw string to resolveAsideContent().
//
// Every claim below has to be true of the shipped product: a jobs list, an
// applicants list with stages, dashboard insights, and company KYC all exist.
// No counts, no customer names, nothing that needs a number we don't have.

/** Icon keys, resolved to components in AuthAside — this module stays JSX-free. */
export type AsideIcon = 'briefcase' | 'users' | 'shield' | 'trend';

/** Which flat brand SVG the panel renders (components/auth/illustrations). */
export type AsideIllustration = 'pipeline' | 'post-job';

export interface AsidePoint {
  icon: AsideIcon;
  label: string;
}

export interface AsideContent {
  eyebrow: string;
  headline: string;
  body: string;
  points: readonly AsidePoint[];
  illustration: AsideIllustration;
}

// Shown on /verify-email/[token] and /accept-invite/[token], which share this
// route group's layout, and as the fallback whenever the pathname header is
// missing (a direct render with no middleware pass). Deliberately brand-level:
// it has to read sensibly beside an invite-acceptance form as well as a
// verification confirmation.
const DEFAULT_CONTENT: AsideContent = {
  eyebrow: 'Recruiter portal',
  headline: 'Hiring, without the clutter.',
  body: 'One place to post jobs, track every applicant, and manage your company profile.',
  points: [
    { icon: 'briefcase', label: 'Every posting in one list' },
    { icon: 'users', label: 'Applicants tracked by stage' },
    { icon: 'shield', label: 'Verified company profiles' },
  ],
  illustration: 'pipeline',
};

const LOGIN_CONTENT: AsideContent = {
  eyebrow: 'Recruiter portal',
  headline: 'Welcome back to your hiring desk.',
  body: 'Your jobs, applicants and company profile are exactly where you left them.',
  points: [
    { icon: 'briefcase', label: 'Every posting in one list' },
    { icon: 'users', label: 'Applicants tracked by stage' },
    { icon: 'trend', label: 'Dashboard insights at a glance' },
  ],
  illustration: 'pipeline',
};

const REGISTER_CONTENT: AsideContent = {
  eyebrow: 'Create your account',
  headline: 'Start hiring on Career Queue.',
  body: 'Post a job, reach candidates across India, and manage every application from one place.',
  points: [
    { icon: 'briefcase', label: 'Post a job in minutes' },
    { icon: 'users', label: 'Shortlist and respond in one place' },
    { icon: 'shield', label: 'Verify your company to build trust' },
  ],
  illustration: 'post-job',
};

const BY_PATH: Readonly<Record<string, AsideContent>> = {
  '/login': LOGIN_CONTENT,
  '/register': REGISTER_CONTENT,
};

/**
 * Reduce a raw pathname to the exact key BY_PATH is written against.
 *
 * The header carries `nextUrl.pathname`, so in practice this only has to strip
 * a trailing slash — but it also drops a query/hash and lowercases, so a
 * hand-passed or future value can't silently fall through to the default panel.
 * Matching stays EXACT after normalising: '/loginX' must not resolve to /login.
 */
export function normalizeAsidePath(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return '';
  const withoutQuery = raw.split(/[?#]/)[0] ?? '';
  const lower = withoutQuery.trim().toLowerCase();
  if (lower === '' || lower === '/') return lower;
  return lower.replace(/\/+$/, '');
}

/** Panel content for a pathname; the brand default for anything unrecognised. */
export function resolveAsideContent(raw: string | null | undefined): AsideContent {
  return BY_PATH[normalizeAsidePath(raw)] ?? DEFAULT_CONTENT;
}

/** Exported for the invariant test — not used at render time. */
export const ASIDE_CONTENTS: readonly AsideContent[] = [
  DEFAULT_CONTENT,
  LOGIN_CONTENT,
  REGISTER_CONTENT,
];
