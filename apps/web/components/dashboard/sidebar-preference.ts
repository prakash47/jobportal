// Where the collapsed/expanded choice for the desktop sidebar rail lives.
//
// A COOKIE, not localStorage, and that is the whole point of this file.
//
// The rail is server-rendered inside DashboardShell. If the preference lived in
// localStorage, the server could not know it, so every page load would paint the
// expanded 16rem rail and then snap to 4rem once an effect ran — a visible jump
// on every navigation, and the exact shape of the hydration mismatch this
// codebase has already been bitten by once. A cookie is sent with the document
// request, so the server renders the right width the first time and the client
// initialises to the identical value. No flash, nothing to reconcile.
//
// Deliberately NOT HttpOnly: the toggle is a client component and has to write
// it. There is nothing sensitive here — it is one bit about a menu — so the
// usual reason for HttpOnly does not apply. It is still SameSite=Lax so it is
// not sent on cross-site requests.

export const SIDEBAR_COOKIE = 'jp_sidebar_collapsed';

/** One year. A layout preference should outlive a session. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Parse the cookie value. Anything that is not exactly '1' means expanded. */
export function isCollapsedValue(raw: string | undefined): boolean {
  return raw === '1';
}

/**
 * Persist the choice from the browser.
 *
 * `Path=/` matters: the rail spans /profile, /applications, /saved-jobs,
 * /alerts and /settings, and a cookie scoped to the path it was set on would
 * silently stop applying as soon as the user navigated to a sibling section.
 */
export function writeSidebarPreference(collapsed: boolean): void {
  document.cookie = `${SIDEBAR_COOKIE}=${collapsed ? '1' : '0'}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax`;
}
