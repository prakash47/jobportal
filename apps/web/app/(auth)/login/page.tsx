'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Input, Label } from '@jobportal/ui';
import { safeNext } from '../../../lib/auth/safe-next';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));
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
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <Button type="submit" loading={loading} className="w-full">
        Sign in
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
      <div className="w-full">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">Welcome back</h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">Sign in to your JobPortal account.</p>

        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>

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
