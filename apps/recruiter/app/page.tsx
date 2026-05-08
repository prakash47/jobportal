import { redirect } from 'next/navigation';
import { readUserFromCookie } from '../lib/auth/server-session';

// Root entry: bounce signed-in recruiters straight to the dashboard, send
// everyone else to login. Candidates who somehow land here also bounce to
// login — the require-recruiter gate on /dashboard will then send them to
// the candidate site.
export default async function HomePage() {
  const user = await readUserFromCookie();
  if (user && user.role === 'RECRUITER') redirect('/dashboard');
  redirect('/login');
}
