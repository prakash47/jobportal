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
} from '@jobportal/ui';
import { api } from '../../lib/api-client';
import type { TeamMember } from './UsersPanel';

export function RemoveUserDialog({
  member,
  open,
  onOpenChange,
  onRemoved,
}: {
  member: TeamMember;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onRemoved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onConfirm() {
    setError(null);
    setLoading(true);
    const res = await api(`/recruiter/users/${member.recruiterId}`, { method: 'DELETE' });
    setLoading(false);
    if (!res.ok) {
      setError(typeof res.message === 'string' ? res.message : 'Could not remove this user.');
      return;
    }
    onOpenChange(false);
    onRemoved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {member.name}?</DialogTitle>
          <DialogDescription>
            They&rsquo;ll immediately lose access to your company&rsquo;s recruiter account and be
            signed out. Jobs they posted are kept. You can invite them again later.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="danger" loading={loading} onClick={onConfirm}>
            Remove user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
