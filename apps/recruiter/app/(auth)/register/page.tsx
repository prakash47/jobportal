'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Input, Label } from '@jobportal/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/recruiter/register`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, workEmail, companyName }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? 'Registration failed');
      }
      // Cookies are set by the API response. Bounce to dashboard — the
      // verify-email banner there will prompt for the work-email click.
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
        Create a recruiter account
      </h1>
      <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
        Post jobs, manage applicants, and reach the right candidates.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input
            id="name"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Login email</Label>
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
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-[var(--color-fg-subtle)]">
            8+ characters, with one digit and one special character.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="companyName">Company name</Label>
          <Input
            id="companyName"
            required
            maxLength={200}
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="workEmail">Work email</Label>
          <Input
            id="workEmail"
            type="email"
            required
            value={workEmail}
            onChange={(e) => setWorkEmail(e.target.value)}
          />
          <p className="text-xs text-[var(--color-fg-subtle)]">
            We&rsquo;ll send a verification link to this address.
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}

        <Button type="submit" loading={loading} className="w-full">
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--color-fg-muted)]">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-[var(--color-fg)] hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
