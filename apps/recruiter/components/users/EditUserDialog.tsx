'use client';

import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@jobportal/ui';
import type { RecruiterRole } from '@jobportal/db';
import { api } from '../../lib/api-client';
import {
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  roleDefaultPermissions,
  type PermissionMap,
} from '../../lib/users/permissions';
import { PermissionFields } from './PermissionFields';
import type { TeamMember } from './UsersPanel';

export function EditUserDialog({
  member,
  open,
  onOpenChange,
  assignableRoles,
  onSaved,
}: {
  member: TeamMember;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  assignableRoles: RecruiterRole[];
  onSaved: () => void;
}) {
  const [role, setRole] = useState<RecruiterRole>(member.companyRole);
  const [perms, setPerms] = useState<PermissionMap>(member.permissions);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function changeRole(next: RecruiterRole) {
    setRole(next);
    // Changing the role resets the matrix to that role's defaults — mirrors the
    // server, which re-derives permissions from the new role unless overridden.
    setPerms(roleDefaultPermissions(next));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await api(`/recruiter/users/${member.recruiterId}`, {
      method: 'PATCH',
      body: JSON.stringify({ companyRole: role, permissions: perms }),
    });
    setLoading(false);
    if (!res.ok) {
      setError(typeof res.message === 'string' ? res.message : 'Could not save your changes.');
      return;
    }
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {member.name}</DialogTitle>
          <DialogDescription>{member.email}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => changeRole(v as RecruiterRole)}>
              <SelectTrigger aria-label="Role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {assignableRoles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-[var(--color-fg-muted)]">{ROLE_DESCRIPTIONS[role]}</p>
          </div>

          <PermissionFields value={perms} onChange={setPerms} />

          {error && (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
