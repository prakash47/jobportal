import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { ACCESS_COOKIE } from '@jobportal/auth';
import { readUserFromCookie } from '../../../../lib/auth/server-session';
import { requireUser } from '../../../../lib/auth/require-user';

const RESUME_DOWNLOAD_FLAG = 'feature.resume_download_pdf';
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// SRS §4.3.4 + CLAUDE.md §4 — three-layer flag enforcement.
// L1: middleware redirects this path away when flag is off (cosmetic).
// L2: this page server-side flag check, notFound() if disabled (defense in
//     depth — a future middleware bypass still can't render the URL).
// L3: API endpoint /me/resume/download returns 403 (the only non-bypassable
//     guard).

export default async function ResumeDownloadPage() {
  await requireUser();
  const session = (await readUserFromCookie())!;

  const allowed = await isFlagEnabled(RESUME_DOWNLOAD_FLAG, { userId: session.sub });
  if (!allowed) notFound();

  // Forward the access cookie so the API's JwtAuthGuard accepts the call.
  const jar = await cookies();
  const accessToken = jar.get(ACCESS_COOKIE)?.value;
  const res = await fetch(`${API_URL}/me/resume/download`, {
    headers: accessToken ? { cookie: `${ACCESS_COOKIE}=${accessToken}` } : {},
    cache: 'no-store',
  });

  if (!res.ok) {
    // The API guard fired even though the flag passed — likely no resume on
    // file, or a race. Send the user back to the resume page where the
    // ResumeManager renders the appropriate state.
    redirect('/profile/resume');
  }

  const body = (await res.json()) as { url?: string };
  if (!body.url) redirect('/profile/resume');

  redirect(body.url);
}
