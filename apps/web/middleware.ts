import { NextResponse, type NextRequest } from 'next/server';
import { isFlagEnabled, FLAG } from '@jobportal/feature-flags';
import { computeCanonicalRedirect } from './lib/url/middleware-core';

// SRS §6.1 + §6.3 — URL canonicalisation pipeline:
//   1. Lowercase paths (301 if uppercase)
//   2. Strip trailing slashes (301)
//   3. Sort multi-value city paths alphabetically (301)
//   4. Strip tracking query params + sort what remains (301)
//   5. Feature-flag route gates (404 when OFF)
//
// Order matters: we collapse all canonicalisation into ONE 301 (no chains)
// before evaluating flag gates.
//
// CLAUDE.md §1 + the @jobportal/feature-flags Redis client require Node APIs,
// so this middleware runs on Node runtime, not Edge. See ADR 0005 for why.

export const config = {
  runtime: 'nodejs',
  matcher: [
    // Skip API routes, _next internals, and static asset extensions.
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?|css|js|json|xml|txt)).*)',
  ],
};

export async function middleware(request: NextRequest): Promise<NextResponse | undefined> {
  // 1-4: canonicalisation. Single 301 if anything changed.
  const canonical = computeCanonicalRedirect(new URL(request.url));
  if (canonical) {
    return NextResponse.redirect(canonical, 301);
  }

  // 5: flag gates (existing behaviour from feature/feature-flag-system).
  const { pathname } = request.nextUrl;

  if (pathname === '/pricing') {
    if (!(await isFlagEnabled(FLAG.PRICING_PAGE_VISIBLE))) {
      return new NextResponse(null, { status: 404 });
    }
  } else if (pathname.startsWith('/services/')) {
    const slug = pathname.split('/')[2];
    if (!slug) return new NextResponse(null, { status: 404 });
    const flagKey = `services.${slug.replaceAll('-', '_')}.enabled`;
    if (!(await isFlagEnabled(flagKey))) {
      return new NextResponse(null, { status: 404 });
    }
  } else if (pathname === '/profile/resume/download') {
    // SRS §4.3.4 + CLAUDE.md §4 — Layer 1 gate for the paid resume download.
    // Layer 2 lives in the page server component; Layer 3 is the API.
    if (!(await isFlagEnabled('feature.resume_download_pdf'))) {
      return NextResponse.redirect(new URL('/profile/resume', request.url), 302);
    }
  }

  // Forward the (canonical) pathname to layouts via header so they can
  // render <link rel="canonical"> without re-deriving the URL.
  const res = NextResponse.next({
    request: {
      headers: new Headers({
        ...Object.fromEntries(request.headers),
        'x-canonical-pathname': pathname,
        'x-canonical-search': request.nextUrl.search,
      }),
    },
  });
  return res;
}
