'use client';

import { Suspense, useId, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Input, Label } from '@jobportal/ui';
import { FormError } from '../../../components/auth/FormError';
import { PasswordInput } from '../../../components/auth/PasswordInput';
import { safeNext } from '../../../lib/auth/safe-next';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));
  // useId() rather than hand-picked ids, per COLLABORATION.md §4.3.
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? 'Login failed');
      }
      // Same /auth/login endpoint as candidates — but require-recruiter
      // on the next page will reject non-RECRUITER roles, redirecting them
      // to the candidate site. UX-wise: recruiters who type /login expect
      // to land on /dashboard; candidates who arrived here by accident
      // get bounced back to where they belong.
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={emailId}>Email</Label>
        <Input
          id={emailId}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={passwordId}>Password</Label>
        <PasswordInput
          id={passwordId}
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {error && <FormError>{error}</FormError>}

      <Button type="submit" loading={loading} size="lg" className="w-full">
        Sign in
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <>
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
    </>
  );
}
