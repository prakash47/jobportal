'use client';

import { useId, useState } from 'react';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
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

export function InviteUserDialog({
  open,
  onOpenChange,
  assignableRoles,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  assignableRoles: RecruiterRole[];
  onInvited: () => void;
}) {
  // Default to the LEAST-privileged assignable role so the common "invite" action
  // never silently grants OWNER/ADMIN — elevating is a deliberate dropdown choice.
  const defaultRole: RecruiterRole = assignableRoles.includes('MEMBER')
    ? 'MEMBER'
    : (assignableRoles[assignableRoles.length - 1] ?? 'MEMBER');
  const emailId = useId();
  const customizeId = useId();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<RecruiterRole>(defaultRole);
  const [customize, setCustomize] = useState(false);
  const [perms, setPerms] = useState<PermissionMap>(() => roleDefaultPermissions(defaultRole));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function changeRole(next: RecruiterRole) {
    setRole(next);
    // Keep the (hidden) matrix aligned to the role's defaults until the admin
    // opts into customizing — so toggling "customize" shows sensible starting values.
    if (!customize) setPerms(roleDefaultPermissions(next));
  }

  function reset() {
    setEmail('');
    setRole(defaultRole);
    setCustomize(false);
    setPerms(roleDefaultPermissions(defaultRole));
    setError(null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError('Enter an email address.');
      return;
    }

    setLoading(true);
    const res = await api('/recruiter/users/invite', {
      method: 'POST',
      body: JSON.stringify({
        email: email.trim(),
        companyRole: role,
        ...(customize ? { permissions: perms } : {}),
      }),
    });
    setLoading(false);

    if (!res.ok) {
      setError(typeof res.message === 'string' ? res.message : 'Could not send the invitation.');
      return;
    }
    reset();
    onOpenChange(false);
    onInvited();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a user</DialogTitle>
          <DialogDescription>
            They&rsquo;ll get an email with a link to set up their account and join your team.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor={emailId}>Email address</Label>
            <Input
              id={emailId}
              type="email"
              autoComplete="off"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
            />
          </div>

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

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id={customizeId}
                checked={customize}
                onCheckedChange={(c) => setCustomize(c === true)}
              />
              <Label htmlFor={customizeId} className="text-sm font-normal">
                Customize module permissions
              </Label>
            </div>
            {customize && <PermissionFields value={perms} onChange={setPerms} />}
          </div>

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
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
