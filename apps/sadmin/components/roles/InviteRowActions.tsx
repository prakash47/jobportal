'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@jobportal/ui';
import { API_URL, describeApiError } from './shared';

/**
 * Resend and revoke for one pending invitation.
 *
 * ⚠ "Resend" mints a NEW token and revokes the current one. The database stores
 * only sha256(raw), so the original link is unrecoverable by anyone including
 * us — there is no way to re-deliver the mail that was already sent. The copy
 * says so, because an admin who assumes otherwise will not understand why the
 * recipient's first link stopped working.
 */
export function InviteRowActions({
  inviteId,
  email,
  killed,
}: {
  inviteId: number;
  email: string;
  /** Layer 2: killswitch.admin_roles_write, read server-side by the page. */
  killed: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // The remount key. Without it an IDENTICAL second failure hits React's
  // Object.is bailout, producing no DOM mutation and announcing nothing — so an
  // admin retrying into the same error would hear it once.
  const [errorNonce, setErrorNonce] = useState(0);
  const [status, setStatus] = useState('');
  // Same problem in the other direction: resending twice yields the same success
  // string. The counter renders as zero-width spaces, which is enough to change
  // the region's content without changing what it reads out.
  const [statusNonce, setStatusNonce] = useState(0);
  const [loading, setLoading] = useState<'resend' | 'revoke' | null>(null);
  const [isPending, startTransition] = useTransition();

  // isPending must be part of `busy`: it covers the router.refresh() that
  // follows, so the row cannot be double-submitted while the page re-renders.
  const busy = loading !== null || isPending;

  async function run(action: 'resend' | 'revoke') {
    setLoading(action);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/admin/staff/invites/${inviteId}/${action}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        setError(await describeApiError(res, action));
        setErrorNonce((n) => n + 1);
        return;
      }
      setStatus(
        action === 'resend'
          ? `A new invitation has been sent to ${email}. Any earlier link no longer works.`
          : `The invitation for ${email} has been revoked.`,
      );
      setStatusNonce((n) => n + 1);
      startTransition(() => router.refresh());
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setErrorNonce((n) => n + 1);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy || killed}
          loading={loading === 'resend'}
          onClick={() => void run('resend')}
        >
          Resend
          <span className="sr-only"> invitation to {email}</span>
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy || killed}
          loading={loading === 'revoke'}
          onClick={() => void run('revoke')}
        >
          Revoke
          <span className="sr-only"> invitation to {email}</span>
        </Button>
      </div>

      {/* Always mounted, text-only changes — see the nonce comments above. */}
      <p role="status" className="sr-only">
        {status}
        {'​'.repeat(statusNonce % 4)}
      </p>

      {error !== null && (
        <p key={errorNonce} role="alert" className="text-xs text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
