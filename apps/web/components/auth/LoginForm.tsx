'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label } from '@jobportal/ui';
import { apiErrorMessage } from '../../lib/auth/api-error';
import { PasswordInput } from './PasswordInput';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface LoginFormProps {
  /**
   * Modal usage: called after a successful login INSTEAD of navigating to
   * `next` — the caller owns the redirect (AuthModal pushes /profile itself).
   */
  onSuccess?: () => void;
  /**
   * Where to send the user after login in page mode. Ignored when onSuccess is
   * set. Defaults to the seeker dashboard.
   */
  next?: string;
  /**
   * Prefix for element ids so the same form can coexist with the register form
   * inside the modal without duplicate ids. Defaults to `login`.
   */
  idPrefix?: string;
}

// Shared sign-in form — the exact /auth/login fetch flow from the old login
// page, extracted so the standalone page AND the AuthModal render identical
// logic (CLAUDE.md §4.12). Only the post-success behaviour is parameterised.
export function LoginForm({ onSuccess, next = '/profile', idPrefix = 'login' }: LoginFormProps) {
  const router = useRouter();
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
        const body = await res.json().catch(() => ({}));
        throw new Error(apiErrorMessage(body, 'Login failed'));
      }
      if (onSuccess) onSuccess();
      else router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  const emailId = `${idPrefix}-email`;
  const passwordId = `${idPrefix}-password`;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
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
