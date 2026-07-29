import { Suspense } from 'react';
import Link from 'next/link';
import { AuthSplit } from '../../../components/auth/AuthSplit';
import { LoginForm } from '../../../components/auth/LoginForm';
import { ASIDE_CONTENT } from '../../../lib/auth/aside-content';

// Server component. The page owns the whole two-pane shell — including its own
// brand panel — rather than inheriting it from the (auth) layout: the App
// Router does not re-render a shared layout when navigating between two of its
// children, and the "Create one" link below is exactly that navigation, so a
// layout-owned panel kept showing the sign-in copy on /register.
//
// The form is a client island reading ?next=, so it needs a Suspense boundary
// (useSearchParams opts the subtree into client rendering).
export default function LoginPage() {
  return (
    <AuthSplit content={ASIDE_CONTENT.login}>
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-3xl">
        Sign in
      </h1>
      <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
        Welcome back to the recruiter portal.
      </p>

      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>

      <p className="mt-8 border-t border-[var(--color-border)] pt-6 text-sm text-[var(--color-fg-muted)]">
        Don&rsquo;t have an account?{' '}
        <Link
          href="/register"
          className="font-medium text-[var(--color-primary-700)] underline-offset-4 hover:underline"
        >
          Create one
        </Link>
      </p>
    </AuthSplit>
  );
}
