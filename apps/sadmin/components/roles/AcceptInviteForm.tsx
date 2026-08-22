'use client';

import { useId, useState } from 'react';
import { Button, Input, Label } from '@jobportal/ui';
import { API_URL, describeApiError } from './shared';

/**
 * Finish setting up an invited staff account.
 *
 * The password is set HERE, by its owner, and never by the super admin who sent
 * the invitation — that is the whole reason this flow exists rather than the
 * obvious shortcut of creating the account with a null password hash and
 * pointing the invitee at forgot-password. That shortcut is already broken and
 * fails silently: password-reset.service.ts short-circuits on a null hash and
 * returns a fallback deliberately indistinguishable from success (ADR 0001), so
 * the invitee would sit watching for a mail that is never sent.
 */
export function AcceptInviteForm({ token, email }: { token: string; email: string }) {
  const nameId = useId();
  const passwordId = useId();
  const emailId = useId();

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  // The remount key: an identical second failure would otherwise hit React's
  // Object.is bailout and announce nothing.
  const [errorNonce, setErrorNonce] = useState(0);
  const [loading, setLoading] = useState(false);

  const canSubmit = name.trim().length > 0 && password.length > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError(null);
    try {
      // POST, never GET. A GET would let an email scanner or link prefetcher
      // consume the invitation before the human ever clicked it.
      const res = await fetch(`${API_URL}/admin/staff/accept-invite`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: name.trim(), password }),
      });
      if (!res.ok) {
        setError(await describeApiError(res, 'accept'));
        setErrorNonce((n) => n + 1);
        setLoading(false);
        return;
      }
      // A HARD navigation rather than router.push: the API has just set the auth
      // cookies, and the server shell has to re-render with them for the (authed)
      // layout to see a session at all.
      //
      // `loading` is deliberately left true through this — the button stays busy
      // until the browser leaves the page, so a second submit cannot land.
      window.location.href = '/sadmin/dashboard';
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setErrorNonce((n) => n + 1);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor={emailId}>Email</Label>
        {/* Shown and locked: the address is bound to the token, so an editable
            field would imply a choice that does not exist. Disabled rather than
            hidden so the invitee can confirm which mailbox this is for. */}
        <Input id={emailId} type="email" value={email} disabled readOnly />
      </div>

      <div className="space-y-2">
        <Label htmlFor={nameId}>Your name</Label>
        <Input
          id={nameId}
          type="text"
          required
          autoComplete="name"
          value={name}
          disabled={loading}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={passwordId}>Choose a password</Label>
        <Input
          id={passwordId}
          type="password"
          required
          autoComplete="new-password"
          value={password}
          disabled={loading}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="text-xs text-[var(--color-fg-muted)]">
          At least 8 characters, including a number and a special character.
        </p>
      </div>

      {error !== null && (
        <p key={errorNonce} role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <Button type="submit" loading={loading} disabled={!canSubmit || loading} className="w-full">
        Create account and sign in
      </Button>
    </form>
  );
}
