import { redirect } from 'next/navigation';
import { readUserFromCookie } from '../lib/auth/server-session';

// Root entry (/sadmin). Send signed-in admins to the dashboard and everyone
// else to the sign-in page. Note the hrefs carry NO '/sadmin' prefix — Next
// applies basePath itself, and writing it here would double-prefix.
//
// A non-ADMIN with a valid cookie (very likely: the seeker and recruiter
// portals share this cookie jar on localhost) falls through to /login rather
// than the dashboard, and requireSuperAdmin() on the dashboard would bounce
// them anyway. The gate is there, not here.
export default async function HomePage() {
  const user = await readUserFromCookie();
  if (user && user.role === 'ADMIN') redirect('/dashboard');
  redirect('/login');
}
