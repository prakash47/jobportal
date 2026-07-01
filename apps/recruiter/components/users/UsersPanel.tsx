'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, IconButton } from '@jobportal/ui';
import { Pencil, Trash2, UserPlus } from '@jobportal/ui/icons';
import type { RecruiterRole } from '@jobportal/db';
import { api } from '../../lib/api-client';
import type { PermissionMap } from '../../lib/users/permissions';
import { RoleBadge } from './RoleBadge';
import { InviteUserDialog } from './InviteUserDialog';
import { EditUserDialog } from './EditUserDialog';
import { RemoveUserDialog } from './RemoveUserDialog';

export interface TeamMember {
  recruiterId: number;
  name: string;
  email: string;
  companyRole: RecruiterRole;
  permissions: PermissionMap;
  isSelf: boolean;
  joinedAt: string;
}

export interface PendingInvite {
  id: number;
  email: string;
  companyRole: RecruiterRole;
  expiresAt: string;
  createdAt: string;
}

export interface Viewer {
  recruiterId: number;
  companyRole: RecruiterRole;
}

const TH =
  'border-b border-[var(--color-border)] bg-[var(--color-bg-muted)] text-left text-xs font-medium uppercase tracking-wide text-[var(--color-fg-muted)]';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function UsersPanel({
  members,
  pendingInvites,
  viewer,
}: {
  members: TeamMember[];
  pendingInvites: PendingInvite[];
  viewer: Viewer;
}) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState<TeamMember | null>(null);

  const canManage = viewer.companyRole === 'OWNER' || viewer.companyRole === 'ADMIN';

  // Owner can act on anyone but themselves; an admin can act only on members.
  function canManageMember(m: TeamMember): boolean {
    if (!canManage || m.isSelf) return false;
    if (viewer.companyRole === 'OWNER') return true;
    return m.companyRole === 'MEMBER';
  }

  const assignableRoles: RecruiterRole[] =
    viewer.companyRole === 'OWNER' ? ['OWNER', 'ADMIN', 'MEMBER'] : ['MEMBER'];

  const refresh = () => router.refresh();

  return (
    <div className="space-y-10">
      {/* Team members */}
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-fg)]">Team members</h2>
            <p className="text-sm text-[var(--color-fg-muted)]">
              {members.length} {members.length === 1 ? 'person has' : 'people have'} access
            </p>
          </div>
          {canManage && (
            <Button onClick={() => setInviteOpen(true)} leadingIcon={<UserPlus className="size-4" />}>
              Invite user
            </Button>
          )}
        </div>

        <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className={TH}>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Email</th>
                <th className="px-4 py-2.5">Role</th>
                {canManage && <th className="px-4 py-2.5 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr
                  key={m.recruiterId}
                  className="border-b border-[var(--color-border)] last:border-b-0"
                >
                  <td className="px-4 py-3 font-medium text-[var(--color-fg)]">
                    {m.name}
                    {m.isSelf && (
                      <span className="ml-2 text-xs font-normal text-[var(--color-fg-muted)]">
                        (you)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-fg-muted)]">{m.email}</td>
                  <td className="px-4 py-3">
                    <RoleBadge role={m.companyRole} />
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      {canManageMember(m) ? (
                        <div className="flex justify-end gap-1">
                          <IconButton
                            size="sm"
                            aria-label={`Edit ${m.name}`}
                            icon={<Pencil className="size-4" />}
                            onClick={() => setEditing(m)}
                          />
                          <IconButton
                            size="sm"
                            variant="ghost"
                            aria-label={`Remove ${m.name}`}
                            icon={<Trash2 className="size-4" />}
                            onClick={() => setRemoving(m)}
                          />
                        </div>
                      ) : (
                        <div className="text-right text-xs text-[var(--color-fg-subtle)]">—</div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pending invitations */}
      {(pendingInvites.length > 0 || canManage) && (
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-fg)]">Pending invitations</h2>
            <p className="text-sm text-[var(--color-fg-muted)]">
              People invited who haven&rsquo;t joined yet.
            </p>
          </div>

          {pendingInvites.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-fg-muted)]">
              No pending invitations.
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className={TH}>
                    <th className="px-4 py-2.5">Email</th>
                    <th className="px-4 py-2.5">Role</th>
                    <th className="px-4 py-2.5">Expires</th>
                    {canManage && <th className="px-4 py-2.5 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {pendingInvites.map((invite) => (
                    <PendingInviteRow
                      key={invite.id}
                      invite={invite}
                      canManage={canManage}
                      onMutated={refresh}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {canManage && (
        <>
          <InviteUserDialog
            open={inviteOpen}
            onOpenChange={setInviteOpen}
            assignableRoles={assignableRoles}
            onInvited={refresh}
          />
          {editing && (
            <EditUserDialog
              member={editing}
              open
              onOpenChange={(o) => !o && setEditing(null)}
              assignableRoles={assignableRoles}
              onSaved={refresh}
            />
          )}
          {removing && (
            <RemoveUserDialog
              member={removing}
              open
              onOpenChange={(o) => !o && setRemoving(null)}
              onRemoved={refresh}
            />
          )}
        </>
      )}
    </div>
  );
}

function PendingInviteRow({
  invite,
  canManage,
  onMutated,
}: {
  invite: PendingInvite;
  canManage: boolean;
  onMutated: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    setError(null);
    setLoading(true);
    const res = await api(`/recruiter/users/invites/${invite.id}/revoke`, { method: 'POST' });
    setLoading(false);
    if (!res.ok) {
      setError(typeof res.message === 'string' ? res.message : 'Could not revoke the invitation.');
      return;
    }
    onMutated();
  }

  return (
    <tr className="border-b border-[var(--color-border)] last:border-b-0">
      <td className="px-4 py-3 font-medium text-[var(--color-fg)]">{invite.email}</td>
      <td className="px-4 py-3">
        <RoleBadge role={invite.companyRole} />
      </td>
      <td className="px-4 py-3 text-[var(--color-fg-muted)]">{fmtDate(invite.expiresAt)}</td>
      {canManage && (
        <td className="px-4 py-3">
          <div className="flex flex-col items-end gap-1">
            <Button variant="ghost" size="sm" loading={loading} onClick={revoke}>
              Revoke
            </Button>
            {error && (
              <p role="alert" className="text-xs text-[var(--color-danger)]">
                {error}
              </p>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}
