import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginForm } from '../../../components/auth/LoginForm';

export const metadata: Metadata = {
  title: 'Sign in — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

// The form is a client island reading ?next= / ?denied=, so it needs a Suspense
// boundary (useSearchParams opts the subtree into client-side rendering).
export default function LoginPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">Sign in</h1>
      <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
        Internal administration for Career Queue. Authorised staff only.
      </p>

      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </>
  );
}
