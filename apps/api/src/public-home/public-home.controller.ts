import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { loadHomePageData } from '@jobportal/domain/home-queries';

// The mobile Home tab, in ONE request.
//
// Genuinely thin — the only endpoint in this programme that is. The aggregate
// already lives in @jobportal/domain/home-queries after the extraction PR, and
// it is the same function the website's homepage renders from, so the two tabs
// cannot show different inventory.
//
// WHY A COMPOSITE rather than letting the app assemble it from /v1/jobs,
// /v1/companies and the catalogs: this is the cold-start path. The loader
// already Promise.all's ~10 queries into one round, and collapsing that into a
// single request is the difference between one mobile round-trip and six on a
// connection where latency, not bandwidth, is the cost.
//
// DELIBERATELY NOT ported from the web page: its
// `if (user?.role === 'CANDIDATE') redirect('/profile')`. That is a web-only
// routing choice, not a data gate — the app decides its own navigation, and a
// redirect here would make the endpoint useless to a signed-in user.
@Controller({ path: 'home', version: '1' })
export class PublicHomeController {
  @Get()
  async home(@Res({ passthrough: true }) res: Response) {
    // Matches the website's `revalidate = 1800`. Without it every cold app-open
    // re-runs the whole 10-query aggregate; with it, a CDN or the client can
    // hold it for the same half hour the web page does. `public` is correct
    // because the payload is identical for every caller — there is no
    // per-user field in it.
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=600');
    return loadHomePageData();
  }
}
