'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@jobportal/ui';
import type { AdminStaffRole } from '@jobportal/db';
import {
  ADMIN_ACCESS_LEVELS,
  ADMIN_ACCESS_LEVEL_LABEL,
  ADMIN_MODULE_LABEL,
  ADMIN_STAFF_ROLE_LABEL,
  ASSIGNABLE_ADMIN_STAFF_ROLES,
  type AdminAccessLevel,
  type AdminModule,
  type AdminPermissionMap,
} from '@jobportal/domain/admin-permissions';
import { OVERRIDABLE_ADMIN_MODULES } from '../../lib/roles/format';
import { API_URL, FIELD_CLASS, describeApiError } from './shared';

/**
 * Role, per-module overrides, and the deactivate/reactivate lever for one
 * staff account.
 *
 * ⚠ `system` is NOT in the matrix. clampSystem() in @jobportal/domain forces it
 * back to the tier default on every resolve, in BOTH directions — a sub-admin
 * cannot be granted it and a super admin cannot have it taken away — so a
 * control for it would be a toggle that silently does nothing, which is worse
 * than no toggle at all. The API's DTO rejects the key outright rather than
 * relying on the resolver to swallow it. The rule is stated in prose below
 * instead, because "why is there no feature-flags checkbox?" is a question worth
 * answering on the screen where someone asks it.
 *
 * The controls here are UI. The API independently re-checks the scope, the
 * killswitch, the last-super-admin count and the self guard.
 */
export function StaffAccessForm({
  staffId,
  name,
  staffRole,
  permissions,
  hasOverrides,
  deactivated,
  isSuperAdmin,
  killed,
}: {
  staffId: number;
  name: string;
  staffRole: AdminStaffRole;
  permissions: AdminPermissionMap;
  hasOverrides: boolean;
  deactivated: boolean;
  isSuperAdmin: boolean;
  /** Layer 2: killswitch.admin_roles_write, read server-side by the page. */
  killed: boolean;
}) {
  const router = useRouter();
  const roleId = useId();

  const [role, setRole] = useState<AdminStaffRole>(staffRole);
  const [levels, setLevels] = useState<AdminPermissionMap>(permissions);
  const [error, setError] = useState<string | null>(null);
  const [errorNonce, setErrorNonce] = useState(0);
  const [status, setStatus] = useState('');
  const [statusNonce, setStatusNonce] = useState(0);
  const [loading, setLoading] = useState<'save' | 'status' | null>(null);
  const [isPending, startTransition] = useTransition();

  const busy = loading !== null || isPending;
  const disabled = busy || killed;

  const dirty =
    role !== staffRole || OVERRIDABLE_ADMIN_MODULES.some((m) => levels[m] !== permissions[m]);

  async function save() {
    setLoading('save');
    setError(null);
    try {
      // Send only the seven overridable modules. `system` would be a 400 — the
      // DTO is .strict() precisely so a mistyped or forbidden key is an error
      // rather than a silently-ignored no-op.
      const body: { staffRole?: AdminStaffRole; permissions: Record<string, AdminAccessLevel> } = {
        permissions: Object.fromEntries(
          OVERRIDABLE_ADMIN_MODULES.map((m) => [m, levels[m]]),
        ) as Record<string, AdminAccessLevel>,
      };
      if (role !== staffRole) body.staffRole = role;

      const res = await fetch(`${API_URL}/admin/staff/${staffId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(await describeApiError(res, 'update'));
        setErrorNonce((n) => n + 1);
        return;
      }
      setStatus(`Access updated for ${name}. It takes effect on their next request.`);
      setStatusNonce((n) => n + 1);
      startTransition(() => router.refresh());
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setErrorNonce((n) => n + 1);
    } finally {
      setLoading(null);
    }
  }

  async function toggleStatus() {
    setLoading('status');
    setError(null);
    const action = deactivated ? 'reactivate' : 'deactivate';
    try {
      const res = await fetch(`${API_URL}/admin/staff/${staffId}/${action}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        setError(await describeApiError(res, action));
        setErrorNonce((n) => n + 1);
        return;
      }
      setStatus(
        action === 'deactivate'
          ? `${name} has been deactivated and signed out of every session.`
          : `${name} has been reactivated.`,
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
    <div className="space-y-8">
      <section className="space-y-4" aria-labelledby="sadmin-staff-role-heading">
        <h2
          id="sadmin-staff-role-heading"
          className="text-sm font-medium uppercase tracking-wide text-[var(--color-fg-muted)]"
        >
          Role and access
        </h2>

        <div className="space-y-2">
          <label htmlFor={roleId} className="block text-sm font-medium text-[var(--color-fg)]">
            Role
          </label>
          <select
            id={roleId}
            className={FIELD_CLASS}
            value={role}
            disabled={disabled || deactivated}
            onChange={(e) => setRole(e.target.value as AdminStaffRole)}
          >
            {/* A SUPER_ADMIN's current tier is listed so the control shows the
                truth, but it is disabled: the tier is not assignable, so
                selecting it back after choosing something else would be offering
                a promotion this API refuses. Choosing anything else IS the
                demotion, and the API guards the last-super-admin case. */}
            {isSuperAdmin && (
              <option value="SUPER_ADMIN" disabled>
                {ADMIN_STAFF_ROLE_LABEL.SUPER_ADMIN}
              </option>
            )}
            {ASSIGNABLE_ADMIN_STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {ADMIN_STAFF_ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          {isSuperAdmin && (
            <p className="text-xs text-[var(--color-fg-muted)]">
              Super Admin cannot be granted through this console, so changing this role is a
              one-way demotion. The last active super admin cannot be demoted at all.
            </p>
          )}
        </div>

        <fieldset disabled={disabled || deactivated} className="space-y-3">
          <legend className="text-sm font-medium text-[var(--color-fg)]">Areas</legend>
          <p className="text-xs text-[var(--color-fg-muted)]">
            {hasOverrides
              ? 'This account has custom access. Because it is set explicitly, it will not follow future changes to the role defaults.'
              : 'This account follows its role defaults. Changing anything below pins it, so it will stop following future changes to those defaults.'}
          </p>

          <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Area
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Access
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {OVERRIDABLE_ADMIN_MODULES.map((mod) => (
                  <ModuleRow
                    key={mod}
                    module={mod}
                    value={levels[mod]}
                    onChange={(level) => setLevels((prev) => ({ ...prev, [mod]: level }))}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-[var(--color-fg-muted)]">
            Feature flags and staff management are not listed. They are one privilege — flag write
            switches off the guards on every area above, and staff management grants any of them
            directly — so it is fixed to the role and cannot be granted or removed per account.
          </p>
        </fieldset>

        <Button type="button" loading={loading === 'save'} disabled={disabled || deactivated || !dirty} onClick={() => void save()}>
          Save access
        </Button>
      </section>

      <section className="space-y-3 border-t border-[var(--color-border)] pt-6" aria-labelledby="sadmin-staff-status-heading">
        <h2
          id="sadmin-staff-status-heading"
          className="text-sm font-medium uppercase tracking-wide text-[var(--color-fg-muted)]"
        >
          {deactivated ? 'Reactivate' : 'Deactivate'}
        </h2>
        <p className="text-sm text-[var(--color-fg-muted)]">
          {deactivated
            ? 'Restores access at the role and areas shown above. They will be able to sign in again immediately.'
            : 'Ends access immediately and signs them out of every session. The account and everything they have logged are kept — staff are never deleted, because deleting one would destroy the approvals, reveals and takedowns they recorded.'}
        </p>
        <Button
          type="button"
          variant="secondary"
          loading={loading === 'status'}
          disabled={disabled}
          onClick={() => void toggleStatus()}
        >
          {deactivated ? 'Reactivate' : 'Deactivate'} {name}
        </Button>
      </section>

      {/* Always mounted; only the text changes. The zero-width spaces make a
          repeated identical message a real DOM mutation so it announces twice. */}
      <p role="status" className="sr-only">
        {status}
        {'​'.repeat(statusNonce % 4)}
      </p>

      {error !== null && (
        <p key={errorNonce} role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}

function ModuleRow({
  module,
  value,
  onChange,
}: {
  module: AdminModule;
  value: AdminAccessLevel;
  onChange: (level: AdminAccessLevel) => void;
}) {
  const id = useId();
  return (
    <tr>
      <td className="px-4 py-3">
        <label htmlFor={id} className="text-[var(--color-fg)]">
          {ADMIN_MODULE_LABEL[module]}
        </label>
      </td>
      <td className="px-4 py-3">
        <select
          id={id}
          className={FIELD_CLASS}
          value={value}
          onChange={(e) => onChange(e.target.value as AdminAccessLevel)}
        >
          {/* Rendered most-permissive first so the strongest grant is the one a
              reader sees at the top of every list on the page. ADMIN_ACCESS_LEVELS
              is declared ascending (NONE → EDIT) because LEVEL_RANK depends on
              that order, so this reverses a COPY rather than the source array. */}
          {[...ADMIN_ACCESS_LEVELS].reverse().map((level) => (
            <option key={level} value={level}>
              {ADMIN_ACCESS_LEVEL_LABEL[level]}
            </option>
          ))}
        </select>
      </td>
    </tr>
  );
}
