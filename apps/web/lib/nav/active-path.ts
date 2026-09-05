/**
 * Does `pathname` belong to the nav section `href` points at?
 *
 * Shared by the desktop nav (`PrimaryNav`) and the mobile drawer (`MobileMenu`)
 * so the two cannot disagree about which tab is lit.
 *
 * Exact matching is not enough: the nav has three hrefs, but a seeker browses
 * far more routes than that, and the highlight vanishing the moment they open a
 * search result is exactly the confusion this exists to remove. So each section
 * owns a set of route SHAPES, taken from the real routes in `apps/web/app`:
 *
 *   Jobs       /jobs · /job/[slug] · and three of the four [...path] SEO
 *              landings — /jobs-in-<city>, /<skill>-jobs, /<skill>-jobs-in-<city>
 *   Companies  /companies · /company/[handle] · /working-at-<slug> (the fourth
 *              SEO landing, which is a company surface rather than a job one)
 *   Career     /career-advice and its articles
 *
 * Note the singular/plural split is real and load-bearing: the LIST lives at
 * `/jobs` and `/companies` while the DETAIL pages live at `/job/…` and
 * `/company/…`.
 */

/** Escapes a literal for use inside a RegExp. */
function esc(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * `startsWith` is the wrong tool here and it fails quietly: `/jobseeker-terms`
 * starts with `/jobs`, so a substring test lights the Jobs tab on a policy page.
 * Matching has to respect the segment boundary.
 */
function selfOrDescendant(base: string): RegExp {
  return new RegExp(`^${esc(base)}(?:/|$)`);
}

/**
 * First path segments that resolve to a real route in `apps/web/app`, and so can
 * NEVER be served by the `[...path]` SEO dispatcher.
 *
 * This mirrors Next's own precedence — static routes beat a catch-all, as the
 * dispatcher's header comment states — and without it the landing patterns are
 * too greedy. `/saved-jobs` is the proof: it is a real page, but it also matches
 * `/<skill>-jobs` with "saved" as the skill, so the Jobs tab lit up while the
 * user was on their saved-jobs page. Caught by test, not by review.
 */
const RESERVED_SEGMENTS: ReadonlySet<string> = new Set([
  'admin',
  'alerts',
  'api',
  'applications',
  'career-advice',
  'companies',
  'company',
  'forgot-password',
  'job',
  'jobs',
  'login',
  'onboarding',
  'profile',
  'register',
  'reset-password',
  'saved-jobs',
  'settings',
  'sitemap',
]);

/** True when the path could actually reach the [...path] SEO dispatcher. */
function reachesSeoDispatcher(path: string): boolean {
  const first = path.split('/')[1] ?? '';
  return first.length > 0 && !RESERVED_SEGMENTS.has(first);
}

const SECTION_PATTERNS: Readonly<Record<string, readonly RegExp[]>> = {
  '/jobs': [
    selfOrDescendant('/jobs'),
    /^\/job\/[^/]+$/,
  ],
  '/companies': [
    selfOrDescendant('/companies'),
    /^\/company\/[^/]+$/,
  ],
  '/career-advice': [selfOrDescendant('/career-advice')],
};

/**
 * The four `[...path]` SEO landing shapes, and which section each belongs to.
 * Only consulted when the path can actually reach the dispatcher.
 */
const SEO_LANDING_PATTERNS: Readonly<Record<string, readonly RegExp[]>> = {
  '/jobs': [/^\/jobs-in-[^/]+$/, /^\/[^/]+-jobs$/, /^\/[^/]+-jobs-in-[^/]+$/],
  '/companies': [/^\/working-at-[^/]+$/],
};

export function isActiveNavPath(pathname: string, href: string): boolean {
  if (!pathname || !pathname.startsWith('/')) return false;

  // usePathname() has no query or hash, but normalise a trailing slash anyway:
  // next.config sets trailingSlash:false, so `/jobs/` should still read as
  // `/jobs` rather than quietly failing to match.
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  const patterns = SECTION_PATTERNS[href];
  if (patterns) {
    if (patterns.some((re) => re.test(path))) return true;
    const seo = SEO_LANDING_PATTERNS[href];
    return !!seo && reachesSeoDispatcher(path) && seo.some((re) => re.test(path));
  }

  // Unknown href — a nav link added later. Fall back to self-or-descendant
  // rather than never matching, so a new entry still lights up without needing
  // a table entry, and still without the `startsWith` trap.
  return selfOrDescendant(href).test(path);
}
