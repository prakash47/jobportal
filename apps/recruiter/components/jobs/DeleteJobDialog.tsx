'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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

/**
 * Destructive confirm for the Jobs list 3-dot menu → Delete. The API only
 * deletes own jobs with ZERO applications (409 otherwise — the menu already
 * disables the item in that case, this is the race-window backstop) and is
 * L3-gated by killswitch.recruiter_job_delete.
 */
export function DeleteJobDialog({
  id,
  title,
  open,
  onOpenChange,
}: {
  id: number;
  title: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  async function onConfirm() {
    setError(null);
    setLoading(true);
    const res = await api(`/recruiter/jobs/${id}`, { method: 'DELETE' });
    setLoading(false);
    if (!res.ok) {
      setError(res.message || 'Could not delete this job.');
      return;
    }
    onOpenChange(false);
    startTransition(() => router.refresh());
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{title}”?</DialogTitle>
          <DialogDescription>
            This permanently removes the posting. It cannot be undone — if the job simply
            shouldn&rsquo;t be visible anymore, close it instead.
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
            Delete job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
