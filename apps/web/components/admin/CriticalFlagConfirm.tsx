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
  Textarea,
} from '@jobportal/ui';
import type { AdminFeatureFlag } from '../../lib/admin/types';

// Confirmation modal for any flag matched by isCriticalFlag(). Required
// reason field — written into the audit log so a future "why was the
// services menu suddenly hidden" question has an answer. Keeping the
// dialog open on save error lets the admin retry without retyping.
export function CriticalFlagConfirm({
  flag,
  onCancel,
  onConfirm,
}: {
  flag: AdminFeatureFlag;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const verb = flag.enabled ? 'Disable' : 'Enable';
  const reasonOk = reason.trim().length >= 4;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {verb} <code className="font-mono text-base">{flag.key}</code>?
          </DialogTitle>
          <DialogDescription>
            This is a critical flag. {impactDescription(flag)} A reason is required and
            will be written to the audit log.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="reason">Reason</Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Rolling back launch — landing page broken on mobile"
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={flag.enabled ? 'danger' : 'primary'}
            disabled={!reasonOk || busy}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(reason.trim());
              } finally {
                setBusy(false);
              }
            }}
          >
            {verb}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function impactDescription(flag: AdminFeatureFlag): string {
  if (flag.key.startsWith('killswitch.')) {
    return flag.enabled
      ? 'Enabling this restores the killed feature for all users.'
      : 'Disabling this kill-switch will stop the affected feature for all users.';
  }
  if (flag.key === 'services.menu.visible') {
    return 'This controls whether the Services menu is visible in the global header for every user.';
  }
  if (flag.key === 'subscription.system.enabled') {
    return 'This is the master switch for the entire billing system — every paid feature depends on it.';
  }
  return 'This affects all users of the platform.';
}
