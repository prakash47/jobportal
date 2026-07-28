'use client';

import { useId, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Input, Label } from '@jobportal/ui';
import { PasswordInput } from './PasswordInput';
import { safeNext } from '../../lib/auth/safe-next';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));
  // Set by requireSuperAdmin() when someone arrives with a valid session for a
  // non-admin account — overwhelmingly a recruiter or candidate whose cookie is
  // shared across portals on this host.
  const denied = searchParams.get('denied') === '1';

  // useId() rather than hand-picked ids — collisions become impossible even if
  // this form is ever rendered twice on one page (COLLABORATION.md §4.3).
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
      // /auth/admin/login, NOT /auth/login. The latter is deliberately
      // role-agnostic and would hand a valid session to any candidate or
      // recruiter who submitted this form; the admin endpoint verifies the
      // password first and then refuses anyone who is not an ADMIN.
      const res = await fetch(`${API_URL}/auth/admin/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        // Only 401/400 collapse to the generic credential message. The API
        // deliberately returns one identical body for a bad password AND for a
        // valid non-admin credential, so being more specific there would
        // reconstruct the account-enumeration oracle the server avoids.
        //
        // Everything else must NOT be reported as a credential problem. The
        // login endpoint is rate-limited (5/min per email, plus a per-email
        // guard), and telling a throttled admin their password is wrong sends
        // them off resetting a password that was never the problem — which is
        // exactly what happened while verifying this form.
        if (res.status === 429) {
          throw new Error('Too many sign-in attempts. Wait a minute and try again.');
        }
        if (res.status >= 500) {
          throw new Error('The server is having trouble. Please try again shortly.');
        }
        throw new Error('Invalid email or password');
      }
      // href is basePath-relative; Next re-applies '/sadmin' on push.
      router.push(next);
      router.refresh();
    } catch (err) {
      // A CORS rejection or a dead API also lands here as a TypeError. Naming
      // the likely cause saves a long debugging detour, because a blocked
      // origin otherwise looks exactly like an auth failure.
      setError(
        err instanceof TypeError
          ? 'Could not reach the API. Check that it is running on ' + API_URL + '.'
          : err instanceof Error
            ? err.message
            : 'Sign-in failed',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {denied && (
        <p
          role="status"
          className="mt-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-3 py-2.5 text-sm text-[var(--color-fg-muted)]"
        >
          That account doesn&rsquo;t have Super Admin access. Sign in with an admin account.
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={emailId}>Email</Label>
          <Input
            id={emailId}
            type="email"
            autoComplete="email"
            autoFocus
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

        {error && (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}

        <Button type="submit" loading={loading} className="w-full">
          Sign in
        </Button>
      </form>
    </>
  );
}
