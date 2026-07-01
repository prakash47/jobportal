'use client';

import { useId, useState } from 'react';
import { Button, Input, Label } from '@jobportal/ui';
import { api } from '../../lib/api-client';

// Mirror of the server DTO rule (packages/auth isStrongPassword / recruiter-auth
// dto.ts): 8+ chars incl. a digit and a special char. Client-side check gives
// instant feedback and keeps well-formed requests off the wire — the API
// re-validates and remains the source of truth.
const STRONG_PASSWORD_RE = /^(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;

// Recruiter self-service password change. Three fields (current / new / confirm),
// a single Save action. Validates locally, POSTs to the BFF, and on success
// clears the form and confirms that other sessions were signed out (the server
// rotated this device's cookies, so the recruiter stays signed in here).
export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const currentId = useId();
  const newId = useId();
  const confirmId = useId();
  const hintId = useId();

  function validate(): string | null {
    if (!currentPassword) return 'Enter your current password.';
    if (!STRONG_PASSWORD_RE.test(newPassword)) {
      return 'New password must be 8+ characters and include at least one digit and one special character.';
    }
    if (newPassword === currentPassword) {
      return 'New password must be different from your current password.';
    }
    if (newPassword !== confirmPassword) return 'New password and confirmation do not match.';
    return null;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    const res = await api('/auth/recruiter/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setLoading(false);

    if (!res.ok) {
      // The API returns a plain string message for the cases a recruiter can hit
      // (wrong current password, killswitch 503, rate-limit 429). Coerce
      // defensively so a validation-issue array can never reach the DOM.
      setError(typeof res.message === 'string' ? res.message : 'Could not change your password.');
      return;
    }

    setSuccess(true);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-5" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor={currentId}>Current password</Label>
        <Input
          id={currentId}
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={newId}>New password</Label>
        <Input
          id={newId}
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          aria-describedby={hintId}
        />
        <p id={hintId} className="text-xs text-[var(--color-fg-muted)]">
          8+ characters, with at least one digit and one special character.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={confirmId}>Confirm new password</Label>
        <Input
          id={confirmId}
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="text-sm text-[var(--color-success)]">
          Password changed. You&rsquo;ve been signed out on all other devices.
        </p>
      )}

      <Button type="submit" loading={loading}>
        Update password
      </Button>
    </form>
  );
}
