import Link from 'next/link';
import { AuthSplit } from '../../../components/auth/AuthSplit';
import { RegisterForm } from '../../../components/auth/RegisterForm';
import { ASIDE_CONTENT } from '../../../lib/auth/aside-content';

// Server component; see login/page.tsx for why the shell is owned per page
// rather than by the (auth) layout.
export default function RegisterPage() {
  return (
    <AuthSplit content={ASIDE_CONTENT.register}>
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-3xl">
        Create a recruiter account
      </h1>
      <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
        Post jobs, manage applicants, and reach the right candidates.
      </p>

      <RegisterForm />

      <p className="mt-8 border-t border-[var(--color-border)] pt-6 text-sm text-[var(--color-fg-muted)]">
        Already have an account?{' '}
        <Link
          href="/login"
          className="font-medium text-[var(--color-primary-700)] underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthSplit>
  );
}
