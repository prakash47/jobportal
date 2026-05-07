import { NextResponse } from 'next/server';
import { suggestCompanyNames, suggestJobTitles } from '@jobportal/search';

// FR-4.1.7 — type-ahead. The client (SearchInput) debounces 200ms and calls
// this endpoint. The handler delegates to the ES completion suggester via
// @jobportal/search and returns { suggestions: string[] }.
//
// Lives in apps/web (not the NestJS BFF) so the in-process @jobportal/search
// call avoids one HTTP hop on the hot type-ahead path.

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const type = url.searchParams.get('type') ?? 'jobs';
  const limitRaw = Number(url.searchParams.get('limit') ?? '8');
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.floor(limitRaw)), 20) : 8;

  if (!q || q.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    const result =
      type === 'companies'
        ? await suggestCompanyNames(q, limit)
        : await suggestJobTitles(q, limit);
    return NextResponse.json({ suggestions: result.suggestions });
  } catch (err) {
    console.error('[api/search/suggest] failed:', err);
    // Fail soft — empty suggestions rather than 5xx so the search input never
    // looks broken when ES has a momentary blip.
    return NextResponse.json({ suggestions: [] });
  }
}
