import { NextResponse, type NextRequest } from 'next/server';

// Internal Super Admin portal — never indexed, under any circumstances. The
// header is the belt; each page's metadata.robots is the braces.
//
// This middleware deliberately does NOT authenticate. Neither does apps/web's
// nor apps/recruiter's: the real gate is requireSuperAdmin() in the (authed)
// layout, which runs on the server for every page in that group. Treating a
// middleware as the auth boundary here would be a mistake — it would look like
// protection while the pages themselves stayed open.
//
// Runtime is pinned to Node for parity with the other two apps (ADR 0005 — the
// feature-flags Redis client cannot run on Edge). Nothing here needs it today,
// but any future flag evaluation in this file would fail confusingly on Edge.
//
// basePath note: `request.nextUrl.pathname` and the matcher below both see the
// path with '/sadmin' ALREADY STRIPPED, so this stays prefix-free — identical
// to the recruiter portal's matcher. If a redirect is ever added here it must
// use `request.nextUrl.clone()`; `new URL('/x', request.url)` drops the
// basePath and produces a redirect loop.

export const config = {
  runtime: 'nodejs',
  matcher: [
    // The bare root is listed separately. Under basePath, Next compiles the
    // catch-all below into a pattern whose path group is mandatory, so it
    // requires a literal "/" after "/sadmin" and never matches "/sadmin"
    // itself — leaving the portal's own entry URL without the X-Robots-Tag
    // this file exists to set. (Verified against the production build:
    // /sadmin had no header while /sadmin/login and /sadmin/dashboard did.)
    '/',
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?|css|js|json|xml|txt)).*)',
  ],
};

export function middleware(request: NextRequest): NextResponse {
  // Forward the canonical path so requireSuperAdmin() can compose ?next= back
  // to wherever the user was actually headed (same contract as apps/recruiter).
  const res = NextResponse.next({
    request: {
      headers: new Headers({
        ...Object.fromEntries(request.headers),
        'x-canonical-pathname': request.nextUrl.pathname,
        'x-canonical-search': request.nextUrl.search,
      }),
    },
  });
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
}
