'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label } from '@jobportal/ui';
import { apiErrorMessage } from '../../lib/auth/api-error';
import { PasswordInput } from './PasswordInput';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface RegisterFormProps {
  /**
   * Called right after a successful registration so the popup can close itself.
   * Registration now auto-logs-in; both the popup and the standalone page then
   * navigate to /onboarding (name prefilled + editable, email locked).
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
        const body = await res.json().catch(() => ({}));
        throw new Error(apiErrorMessage(body, 'Registration failed'));
      }
      // Account is created AND auto-logged-in → straight to the onboarding step
      // (name editable, email locked). onSuccess lets the popup close itself.
      onSuccess?.();
      router.push('/onboarding');
      router.refresh();
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
        <PasswordInput
          id={passwordId}
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
