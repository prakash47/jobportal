import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getGoogleEnabled } from '../../../lib/auth/google-status';
import { readUserFromCookie } from '../../../lib/auth/server-session';
import { LoginPageForm } from './LoginPageForm';

// Standalone /login route — kept as the fallback path (the navbar opens the
// auth popup). Still serves guard redirects (?next=), deep links, no-JS users,
// and is where a failed Google sign-in bounces back (?error=google).
export default async function LoginPage() {
  // A signed-in seeker never needs the login form — bounce them to the dashboard
  // (with the server-side header, they no longer see a "Sign in" button anyway,
  // but the footer link + a typed URL still reach here).
  const user = await readUserFromCookie();
  if (user?.role === 'CANDIDATE') redirect('/profile');

  const googleEnabled = await getGoogleEnabled();

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
      <div className="w-full">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">Welcome back</h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">Sign in to your JobPortal account.</p>

        <div className="mt-8">
          <Suspense fallback={null}>
            <LoginPageForm googleEnabled={googleEnabled} />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-sm text-[var(--color-fg-muted)]">
          <Link href="/forgot-password" className="hover:text-[var(--color-fg)]">
            Forgot password?
          </Link>
          <span className="mx-2">·</span>
          <Link href="/register" className="hover:text-[var(--color-fg)]">
            Create account
          </Link>
        </p>
      </div>
    </main>
  );
}
