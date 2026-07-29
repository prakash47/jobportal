'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label } from '@jobportal/ui';
import { FormError } from './FormError';
import { PasswordInput } from './PasswordInput';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// The client island of /register. The page around it is a server component, so
// the brand panel and the static copy stay out of the client bundle.
export function RegisterForm() {
  const router = useRouter();
  // useId() rather than hand-picked ids, per COLLABORATION.md §4.3. The hint
  // ids are what let the helper text be announced with its field rather than
  // read as loose prose after it.
  const nameId = useId();
  const emailId = useId();
  const emailHintId = useId();
  const passwordId = useId();
  const passwordHintId = useId();
  const companyId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
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
        body: JSON.stringify({ email, password, name, companyName }),
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
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={nameId}>Your name</Label>
        <Input
          id={nameId}
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={emailId}>Email ID</Label>
        <Input
          id={emailId}
          type="email"
          autoComplete="email"
          required
          aria-describedby={emailHintId}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <p id={emailHintId} className="text-xs text-[var(--color-fg-muted)]">
          We&rsquo;ll send a verification link to this address.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={passwordId}>Password</Label>
        <PasswordInput
          id={passwordId}
          autoComplete="new-password"
          required
          aria-describedby={passwordHintId}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p id={passwordHintId} className="text-xs text-[var(--color-fg-muted)]">
          8+ characters, with one digit and one special character.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={companyId}>Company name</Label>
        <Input
          id={companyId}
          required
          maxLength={200}
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
        />
      </div>

      {error && <FormError>{error}</FormError>}

      <Button type="submit" loading={loading} size="lg" className="w-full">
        Create account
      </Button>
    </form>
  );
}
