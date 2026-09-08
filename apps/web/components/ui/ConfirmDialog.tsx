'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@jobportal/ui';
import { Trash2 } from '@jobportal/ui/icons';

/**
 * A confirmation prompt for a destructive action.
 *
 * Extracted from the sign-out dialog in `DashboardChrome`, which established
 * the shape the owner signed off on: `max-w-md` rather than the primitive's
 * `max-w-lg`, because two lines of copy centred in a 512px box reads as
 * unfinished; a danger-tinted disc rather than a solid red fill, so the glyph
 * still reads on it and the dialog does not become the loudest thing on screen;
 * and a `danger` confirm button.
 *
 * Deleting a saved profile row is genuinely irreversible — unlike signing out —
 * so the treatment fits here without the argument that one needed.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  busy = false,
  icon,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  busy?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Never let an outside click or Escape close the dialog mid-request:
        // the row would vanish or persist with no explanation either way.
        if (!next && busy) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <span
            aria-hidden="true"
            className="mb-1 flex size-10 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--color-danger),var(--color-bg-elevated)_88%)] text-[var(--color-danger)]"
          >
            {icon ?? <Trash2 className="size-5" />}
          </span>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant="danger" loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
