import { NextResponse, type NextRequest } from 'next/server';
import { isFlagEnabled, FLAG } from '@jobportal/feature-flags';

// Layer 1 enforcement (SRS §7.12 + CLAUDE.md §4).
// Returns 404 for any pathname whose flag is OFF before the route handler runs.
//
// Currently gates:
//   /services/<slug>   →  services.<slug_underscored>.enabled
//   /pricing           →  subscription.pricing_page.visible

export const config = {
  // ioredis (used by @jobportal/feature-flags) needs Node APIs;
  // Edge runtime can't load it.
  runtime: 'nodejs',
  matcher: ['/services/:path*', '/pricing'],
};

export async function middleware(request: NextRequest): Promise<NextResponse | undefined> {
  const { pathname } = request.nextUrl;

  if (pathname === '/pricing') {
    if (!(await isFlagEnabled(FLAG.PRICING_PAGE_VISIBLE))) {
      return new NextResponse(null, { status: 404 });
    }
    return undefined;
  }

  if (pathname.startsWith('/services/')) {
    const slug = pathname.split('/')[2];
    if (!slug) return new NextResponse(null, { status: 404 });
    const key = `services.${slug.replaceAll('-', '_')}.enabled`;
    if (!(await isFlagEnabled(key))) {
      return new NextResponse(null, { status: 404 });
    }
    return undefined;
  }

  return undefined;
}
