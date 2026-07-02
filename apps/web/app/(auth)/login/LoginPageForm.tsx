'use client';

import { useSearchParams } from 'next/navigation';
import { safeNext } from '../../../lib/auth/safe-next';
import { GoogleButton } from '../../../components/auth/GoogleButton';
import { OrDivider } from '../../../components/auth/OrDivider';
import { LoginForm } from '../../../components/auth/LoginForm';

// Client body of /login — reads ?next= (open-redirect-guarded) and ?error=google
// (set when a Google sign-in bounces back here on failure). Lives behind a
// Suspense boundary in page.tsx because useSearchParams bails out of prerender.
export function LoginPageForm({ googleEnabled }: { googleEnabled: boolean }) {
  const searchParams = useSearchParams();
  // Bare "/" (no ?next= or a rejected one) means "no deep link" — land on the
  // seeker dashboard instead, matching GoogleButton's fallback for existing
  // accounts. A real deep link (?next=/job/... from a guard bounce) is honoured.
  const rawNext = safeNext(searchParams.get('next'));
  const next = rawNext === '/' ? '/profile' : rawNext;
  const googleError = searchParams.get('error') === 'google';

  return (
    <>
      {googleError && (
        <div className="mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-3.5 py-2.5 text-sm text-[var(--color-fg)]">
          Google sign-in didn&apos;t complete. Please try again, or use your email and password.
        </div>
      )}

      {googleEnabled && (
        <>
          <GoogleButton label="Sign in with Google" next={next} />
          <OrDivider />
        </>
      )}

      <LoginForm next={next} />
    </>
  );
}
