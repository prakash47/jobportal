import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getGoogleEnabled } from '../../../lib/auth/google-status';
import { readUserFromCookie } from '../../../lib/auth/server-session';
import { GoogleButton } from '../../../components/auth/GoogleButton';
import { OrDivider } from '../../../components/auth/OrDivider';
import { RegisterForm } from '../../../components/auth/RegisterForm';

// Standalone /register route — kept as the fallback path (the navbar opens the
// auth popup). On success the shared RegisterForm auto-logs-in and navigates to
// /onboarding (identical to the popup — there is no longer a page-vs-popup branch).
export default async function RegisterPage() {
  // A signed-in seeker is already registered — send them to the dashboard.
  const user = await readUserFromCookie();
  if (user?.role === 'CANDIDATE') redirect('/profile');

  const googleEnabled = await getGoogleEnabled();

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
      <div className="w-full">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">Create your account</h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">Start your job search on JobPortal.</p>

        <div className="mt-8">
          {googleEnabled && (
            <>
              <GoogleButton label="Sign up with Google" />
              <OrDivider />
            </>
          )}
          <RegisterForm />
        </div>

        <p className="mt-6 text-center text-sm text-[var(--color-fg-muted)]">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-[var(--color-fg)] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
