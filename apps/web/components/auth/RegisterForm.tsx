'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label } from '@jobportal/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface RegisterFormProps {
  /**
   * Modal usage: called after a successful registration INSTEAD of navigating
   * to /login?registered=1 (the popup switches to its Sign in tab). When
   * omitted (standalone /register page), the original navigation is preserved.
   * Note: /auth/register does not establish a session — the user signs in next.
   */
  onSuccess?: () => void;
  /** Prefix for element ids so this form can coexist with the login form in the modal. */
  idPrefix?: string;
}

// Shared registration form — the exact /auth/register fetch flow from the old
// register page, extracted so the standalone page AND the AuthModal render
// identical logic (CLAUDE.md §4.12). Only the post-success behaviour differs.
export function RegisterForm({ onSuccess, idPrefix = 'register' }: RegisterFormProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, phone: phone || undefined }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? 'Registration failed');
      }
      if (onSuccess) onSuccess();
      else router.push('/login?registered=1');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  const nameId = `${idPrefix}-name`;
  const emailId = `${idPrefix}-email`;
  const passwordId = `${idPrefix}-password`;
  const phoneId = `${idPrefix}-phone`;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={nameId}>Name</Label>
        <Input
          id={nameId}
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
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
        <Input
          id={passwordId}
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby={`${passwordId}-hint`}
        />
        <p id={`${passwordId}-hint`} className="text-xs text-[var(--color-fg-muted)]">
          8+ chars, must include a digit and a special character.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={phoneId}>
          Phone <span className="text-[var(--color-fg-subtle)]">(optional)</span>
        </Label>
        <Input
          id={phoneId}
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
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
  );
}
