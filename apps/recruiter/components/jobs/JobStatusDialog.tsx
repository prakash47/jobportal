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

const COPY = {
  close: {
    title: (t: string) => `Close “${t}”?`,
    description:
      'Candidates will no longer see this job or be able to apply. You can reopen it from this menu later.',
    confirm: 'Close job',
    variant: 'danger' as const,
    fallbackError: 'Could not close this job.',
  },
  reopen: {
    title: (t: string) => `Reopen “${t}”?`,
    // Worded like `publish` below, and for the same reason: reopen() honours the
    // moderation flag, so with moderation on a reopened job goes to review
    // first. The old copy promised it "goes live again immediately — it
    // reappears in search and starts accepting applications", which is false
    // under moderation: the job is not indexed and applications are refused.
    description:
      'Reopening resubmits this job. Once it goes live it reappears in search and starts accepting applications again.',
    confirm: 'Reopen job',
    variant: 'primary' as const,
    fallbackError: 'Could not reopen this job.',
  },
  publish: {
    title: (t: string) => `Publish “${t}”?`,
    // Worded to stay true whether or not admin moderation is on: with moderation
    // off the job is live at once, with it on it goes to review first — "once it
    // goes live" covers both without promising immediacy.
    description:
      'Publishing submits this draft. Once it goes live it appears in search and starts accepting applications, and it counts toward your job-posting limit.',
    confirm: 'Publish job',
    variant: 'primary' as const,
    fallbackError: 'Could not publish this job.',
  },
};

// Reopening doesn't reset the expiry date, so a reopened EXPIRED job would be
// re-expired by the next nightly sweep unless the recruiter extends it.
const EXPIRY_NOTE =
  'This job’s expiry date has already passed — extend it from Edit after reopening, or the nightly sweep will expire it again.';

/**
 * Confirm dialog for the close / reopen / publish status transitions (Jobs list
 * 3-dot menu), each a bodyless POST to /recruiter/jobs/:id/<action>. Replaces
 * the old window.confirm in JobActions.tsx with the app's
 * canonical confirm pattern (see users/RemoveUserDialog) — including an inline
 * error the native confirm could never show.
 */
export function JobStatusDialog({
  id,
  title,
  action,
  open,
  onOpenChange,
  showExpiryNote = false,
}: {
  id: number;
  title: string;
  action: 'close' | 'reopen' | 'publish';
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Reopening an EXPIRED job — warn that the past expiry date still applies. */
  showExpiryNote?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();
  const copy = COPY[action];

  async function onConfirm() {
    setError(null);
    setLoading(true);
    const res = await api(`/recruiter/jobs/${id}/${action}`, { method: 'POST' });
    setLoading(false);
    if (!res.ok) {
      setError(res.message || copy.fallbackError);
      return;
    }
    onOpenChange(false);
    startTransition(() => router.refresh());
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title(title)}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        {action === 'reopen' && showExpiryNote && (
          <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-3 py-2 text-sm text-[var(--color-fg-muted)]">
            {EXPIRY_NOTE}
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant={copy.variant} loading={loading} onClick={onConfirm}>
            {copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
