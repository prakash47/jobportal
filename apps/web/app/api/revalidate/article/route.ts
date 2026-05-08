import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { handleRevalidate } from '../../../../lib/cms/revalidate-handler';

// SRS §4.8.2 — admin authoring tool (Task 19) calls this on publish/edit/
// archive so the SSG output goes stale immediately rather than waiting for
// the revalidate=3600 safety net. Auth via Bearer REVALIDATE_SECRET.

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => null);
  const result = await handleRevalidate({
    authHeader: req.headers.get('authorization'),
    body,
    secret: process.env['REVALIDATE_SECRET'],
    revalidatePath,
  });
  return NextResponse.json(result.body, { status: result.status });
}
