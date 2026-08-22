// The rail's hrefs, in order — the input to the server-side scope filter.
//
// ── Why this is NOT exported from SidebarNav.tsx ────────────────────────────
//
// It was, and it crashed the whole portal at runtime with
// "hrefs.filter is not a function" — a bug that typecheck, the unit suites and
// `pnpm build` all passed clean, and only opening the page revealed.
//
// SidebarNav is a 'use client' module. When a SERVER component imports a value
// from a client module, Next does not hand back the value: it hands back a
// client reference proxy, so the array arrives as an object with no array
// methods on it. The types say `readonly string[]` on both sides, which is why
// tsc cannot see it, and nothing renders the (authed) layout during a build, so
// the build cannot see it either.
//
// Keeping the list in a plain server-safe module fixes that and keeps
// @jobportal/domain out of the client bundle on EVERY page — the nav renders on
// all of them, unlike the /roles forms that legitimately pull it in.
//
// The cost is a second list, and nav-visibility.test.ts pays it off: it parses
// NAV_ITEMS out of SidebarNav.tsx on disk and asserts the two agree exactly, in
// both directions. Adding a rail row without adding it here — or the reverse —
// is a failing test, not a silently unfiltered link.

export const NAV_ITEM_HREFS: readonly string[] = [
  '/dashboard',
  '/jobs',
  '/job-postings',
  '/reports',
  '/employers',
  '/candidates',
  '/otp-sessions',
  '/subscriptions',
  '/transactions',
  '/support',
  '/broadcasts',
  '/roles',
];
