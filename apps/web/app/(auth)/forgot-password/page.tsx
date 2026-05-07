'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, Card, Input, Label } from '@jobportal/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? 'Request failed');
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
      <div className="w-full">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">Reset your password</h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Enter the email associated with your account. We will send you a reset link valid for 15 minutes.
        </p>

        {submitted ? (
          <Card className="mt-8 bg-[var(--color-bg-muted)] p-4 text-sm text-[var(--color-fg)]" role="status">
            If an account exists for{' '}
            <span className="font-medium">{email}</span>, a reset link is on its way. Check your inbox.
          </Card>
        ) : (
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

            {error && (
              <p role="alert" className="text-sm text-[var(--color-danger)]">
                {error}
              </p>
            )}

            <Button type="submit" loading={loading} className="w-full">
              Send reset link
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-[var(--color-fg-muted)]">
          <Link href="/login" className="hover:text-[var(--color-fg)]">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
