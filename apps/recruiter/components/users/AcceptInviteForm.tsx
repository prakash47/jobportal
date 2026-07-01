'use client';

import { useId, useState } from 'react';
import { Button, Input, Label } from '@jobportal/ui';
import { api } from '../../lib/api-client';

// Mirror of the server password rule (packages/auth isStrongPassword): 8+ chars
// incl. a digit and a special char. Client check gives instant feedback; the API
// re-validates and is the source of truth.
const STRONG_PASSWORD_RE = /^(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;

export function AcceptInviteForm({ token, email }: { token: string; email: string }) {
  const emailId = useId();
  const nameId = useId();
  const pwId = useId();
  const confirmId = useId();
  const hintId = useId();

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validate(): string | null {
    if (!name.trim()) return 'Enter your name.';
    if (!STRONG_PASSWORD_RE.test(password)) {
      return 'Password must be 8+ characters and include at least one digit and one special character.';
    }
    if (password !== confirm) return 'Passwords do not match.';
    return null;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    const res = await api('/recruiter/users/accept-invite', {
      method: 'POST',
      body: JSON.stringify({ token, name: name.trim(), password }),
    });

    if (!res.ok) {
      setLoading(false);
      setError(typeof res.message === 'string' ? res.message : 'Could not accept the invitation.');
      return;
    }
    // The API set the auth cookies (auto-login). Hard-navigate so the recruiter
    // shell re-renders server-side with the fresh session.
    window.location.href = '/dashboard';
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor={emailId}>Email</Label>
        <Input id={emailId} type="email" value={email} readOnly disabled />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={nameId}>Your name</Label>
        <Input
          id={nameId}
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={pwId}>Create a password</Label>
        <Input
          id={pwId}
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby={hintId}
        />
        <p id={hintId} className="text-xs text-[var(--color-fg-muted)]">
          8+ characters, with at least one digit and one special character.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={confirmId}>Confirm password</Label>
        <Input
          id={confirmId}
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <Button type="submit" loading={loading} className="w-full">
        Accept &amp; join
      </Button>
    </form>
  );
}
