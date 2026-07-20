import { NextResponse, type NextRequest } from 'next/server';
import { FLAG, isFlagEnabled } from '@jobportal/feature-flags';

// SRS §4.9.2 — recruiter portal pages are private; never indexed. Each
// authed page also sets metadata.robots = noindex,nofollow defensively.
//
// We also forward the canonical pathname/search to layouts via a header so
// requireRecruiter() can compose ?next= back to where the user was headed.
//
// Same Node runtime as apps/web's middleware (required by the feature-flags
// Redis client, ADR 0005); no canonicalisation pipeline needed here (recruiter
// portal isn't SEO-bound).

export const config = {
  runtime: 'nodejs',
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?|css|js|json|xml|txt)).*)',
  ],
};

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // CLAUDE.md §4 — Layer 1 gate for the Plans & Billing surface. Gated on
  // RECRUITER_PLANS_VISIBLE (seeded ON) so every recruiter can see the plan
  // catalogue and their own Free-plan state; SUBSCRIPTION_SYSTEM (seeded OFF)
  // separately gates whether anything can be BOUGHT, enforced at the API.
  // Layer 2 is each page's notFound(); Layer 3 is the API (the only trusted
  // boundary).
  if (pathname === '/plans' || pathname === '/billing' || pathname.startsWith('/billing/')) {
    if (!(await isFlagEnabled(FLAG.RECRUITER_PLANS_VISIBLE))) {
      return new NextResponse(null, { status: 404 });
    }
  }

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
