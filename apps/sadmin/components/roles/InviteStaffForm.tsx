'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label } from '@jobportal/ui';
import {
  ADMIN_STAFF_ROLE_LABEL,
  ASSIGNABLE_ADMIN_STAFF_ROLES,
  type AssignableAdminStaffRole,
} from '@jobportal/domain/admin-permissions';
import { API_URL, FIELD_CLASS, describeApiError } from './shared';

/**
 * Invite someone to become platform staff.
 *
 * Tier only — no per-module override editor here. Overrides are set on the
 * detail screen after the account exists, and the split is deliberate: the tier
 * defaults are the reviewed, conservative baseline, and offering a matrix at
 * invite time invites someone to hand-build a permission set for a colleague who
 * has not yet accepted, in a form they will not revisit. Granting the tier and
 * then narrowing it is the order that keeps the defaults meaningful.
 *
 * SUPER_ADMIN is absent from the tier list because ASSIGNABLE_ADMIN_STAFF_ROLES
 * excludes it — the tier that can grant every other tier stays seed-or-psql
 * only. That is the property FR-4.12.10 exists to protect, and the API derives
 * its allowlist from the same array rather than a second list.
 */
export function InviteStaffForm() {
  const router = useRouter();
  const emailId = useId();
  const roleId = useId();

  const [email, setEmail] = useState('');
  const [staffRole, setStaffRole] = useState<AssignableAdminStaffRole>('SUPPORT_ADMIN');
  const [error, setError] = useState<string | null>(null);
  // The remount key: an identical second failure would otherwise hit React's
  // Object.is bailout and announce nothing.
  const [errorNonce, setErrorNonce] = useState(0);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  // isPending covers the router.push/refresh that follows a success, so the form
  // cannot be submitted twice into a duplicate invite while the page re-renders.
  const busy = loading || isPending;
  const canSubmit = email.trim().length > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/admin/staff/invite`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), staffRole }),
      });
      if (!res.ok) {
        setError(await describeApiError(res, 'invite'));
        setErrorNonce((n) => n + 1);
        return;
      }

      // The API answers with one of three outcomes and they are genuinely
      // different events, so the confirmation must not flatten them into "sent".
      // "This address already has an account" is the EXPECTED case here — admins
      // are provisioned by direct DB write (CLAUDE.md §9), so a colleague who
      // already has the role but no tier is what a hand-promotion leaves behind,
      // and telling them to watch for an email that will never arrive is the
      // failure this copy exists to prevent.
      const body = (await res.json().catch(() => null)) as { status?: unknown } | null;
      const outcome = typeof body?.status === 'string' ? body.status : 'invited';
      setStatus(
        outcome === 'invited'
          ? 'Invitation sent.'
          : outcome === 'granted'
            ? 'That account already existed, so access was granted directly — no email was sent and they can sign in now.'
            : 'That account was previously deactivated, so it has been restored — no email was sent.',
      );

      // Hard-ish navigation via the router so the roster re-reads Postgres and
      // the new row (or invite) is actually there when it renders. `loading`
      // stays true through the transition so the button cannot be pressed again.
      startTransition(() => {
        router.push('/roles');
        router.refresh();
      });
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setErrorNonce((n) => n + 1);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor={emailId}>Work email</Label>
        <Input
          id={emailId}
          type="email"
          required
          autoComplete="off"
          value={email}
          disabled={busy}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="colleague@careerqueue.in"
        />
        <p className="text-xs text-[var(--color-fg-muted)]">
          An address that already belongs to a job seeker or employer cannot be made staff — use a
          different one.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={roleId}>Role</Label>
        {/* Native <select>, like every other form in this portal. */}
        <select
          id={roleId}
          className={FIELD_CLASS}
          value={staffRole}
          disabled={busy}
          onChange={(e) => setStaffRole(e.target.value as AssignableAdminStaffRole)}
        >
          {ASSIGNABLE_ADMIN_STAFF_ROLES.map((role) => (
            <option key={role} value={role}>
              {ADMIN_STAFF_ROLE_LABEL[role]}
            </option>
          ))}
        </select>
        <p className="text-xs text-[var(--color-fg-muted)]">
          Each role comes with a reviewed default set of areas. You can narrow it further once the
          account exists. Super Admin cannot be granted here — it is set directly on the database
          by design.
        </p>
      </div>

      {/* Always mounted so it can announce; only its text changes. */}
      <p role="status" className="sr-only">
        {status}
      </p>

      {error !== null && (
        <p key={errorNonce} role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <Button type="submit" loading={loading} disabled={!canSubmit || busy}>
        Send invitation
      </Button>
    </form>
  );
}
