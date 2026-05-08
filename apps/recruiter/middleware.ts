import { NextResponse, type NextRequest } from 'next/server';

// SRS §4.9.2 — recruiter portal pages are private; never indexed. Each
// authed page also sets metadata.robots = noindex,nofollow defensively.
//
// We also forward the canonical pathname/search to layouts via a header so
// requireRecruiter() can compose ?next= back to where the user was headed.
//
// Same Node runtime as apps/web's middleware; no canonicalisation pipeline
// needed here (recruiter portal isn't SEO-bound).

export const config = {
  runtime: 'nodejs',
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?|css|js|json|xml|txt)).*)',
  ],
};

export function middleware(request: NextRequest): NextResponse {
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
