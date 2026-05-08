'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Input,
  Label,
  Switch,
  Textarea,
} from '@jobportal/ui';
import {
  isCriticalFlag,
  type AdminFeatureFlag,
  type SubscriptionTier,
} from '../../lib/admin/types';
import { arraysEqual, parseUserIds, setEqual } from '../../lib/admin/flag-edit-helpers';

const TIERS: SubscriptionTier[] = ['FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE'];

export interface FlagEditSidePanelProps {
  flag: AdminFeatureFlag;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: PatchPayload) => Promise<void>;
}

export interface PatchPayload {
  enabled?: boolean;
  percentage?: number | null;
  targetUserIds?: number[];
  requiredTiers?: SubscriptionTier[];
  cohorts?: string[];
  reason: string;
}

// Slide-over editor for non-BOOLEAN flag types. The form is uncontrolled
// (init from props on open, dispatch a single PATCH on save) so the
// admin can stage multiple edits before committing — important for
// USER_TARGETED where pasting a long ID list takes seconds.
//
// A required reason field on every save (even non-critical ones here)
// because advanced edits are inherently load-bearing — "why does this
// flag now target user 99?" is a question we want the audit log to
// answer.
export function FlagEditSidePanel({ flag, open, onOpenChange, onSave }: FlagEditSidePanelProps) {
  const [enabled, setEnabled] = useState(flag.enabled);
  const [percentage, setPercentage] = useState<string>(
    flag.percentage === null ? '' : String(flag.percentage),
  );
  const [userIds, setUserIds] = useState<string>(flag.targetUserIds.join(', '));
  const [tiers, setTiers] = useState<Set<SubscriptionTier>>(new Set(flag.requiredTiers));
  const [cohorts, setCohorts] = useState<string[]>(flag.cohorts);
  const [cohortDraft, setCohortDraft] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-init local form state every time the panel opens with a different
  // flag — otherwise switching between two flags would carry the first
  // one's draft into the second.
  useEffect(() => {
    if (!open) return;
    setEnabled(flag.enabled);
    setPercentage(flag.percentage === null ? '' : String(flag.percentage));
    setUserIds(flag.targetUserIds.join(', '));
    setTiers(new Set(flag.requiredTiers));
    setCohorts(flag.cohorts);
    setCohortDraft('');
    setReason('');
    setError(null);
  }, [open, flag]);

  const reasonOk = reason.trim().length >= 4;

  function buildPatch(): PatchPayload | { error: string } {
    const patch: PatchPayload = { reason: reason.trim() };

    if (enabled !== flag.enabled) patch.enabled = enabled;

    if (flag.type === 'PERCENTAGE_ROLLOUT') {
      const trimmed = percentage.trim();
      if (trimmed === '') {
        patch.percentage = null;
      } else {
        const n = Number(trimmed);
        if (!Number.isInteger(n) || n < 0 || n > 100) {
          return { error: 'Percentage must be an integer between 0 and 100.' };
        }
        if (n !== flag.percentage) patch.percentage = n;
      }
    }

    if (flag.type === 'USER_TARGETED') {
      const parsed = parseUserIds(userIds);
      if (parsed.error) return { error: parsed.error };
      // Set-equality (order-insensitive). If the DB row was ever written
      // with a non-canonical order, a strict array compare would produce
      // a spurious PATCH on every save with no real change — that adds
      // audit-log noise for changes that didn't happen.
      if (!setEqual(parsed.ids, flag.targetUserIds)) {
        patch.targetUserIds = parsed.ids;
      }
    }

    if (flag.type === 'TIER_GATED') {
      const next = TIERS.filter((t) => tiers.has(t));
      if (!setEqual(next, flag.requiredTiers)) {
        patch.requiredTiers = next;
      }
    }

    if (flag.type === 'COHORT_TARGETED') {
      // Trim cohortDraft if the admin is mid-typing — surfacing as an
      // error is friendlier than silently dropping it.
      if (cohortDraft.trim().length > 0) {
        return {
          error: 'Press Enter to add the cohort you typed, or clear it before saving.',
        };
      }
      // Cohorts ARE order-sensitive in the spec (no canonical sort) so
      // strict array compare is correct here.
      if (!arraysEqual(cohorts, flag.cohorts)) {
        patch.cohorts = cohorts;
      }
    }

    return patch;
  }

  async function handleSave() {
    if (!reasonOk) return;
    const built = buildPatch();
    if ('error' in built) {
      setError(built.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(built);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  function addCohort() {
    const v = cohortDraft.trim();
    if (!v) return;
    if (cohorts.includes(v)) {
      setCohortDraft('');
      return;
    }
    setCohorts([...cohorts, v]);
    setCohortDraft('');
  }

  function removeCohort(c: string) {
    setCohorts(cohorts.filter((x) => x !== c));
  }

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/30 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <RadixDialog.Content className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col gap-5 overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right">
          <header className="space-y-1">
            <RadixDialog.Title className="text-lg font-semibold tracking-tight text-[var(--color-fg)]">
              {flag.uiLabel ?? flag.key}
            </RadixDialog.Title>
            <code className="block font-mono text-xs text-[var(--color-fg-muted)]">
              {flag.key}
            </code>
            <div className="flex items-center gap-2 pt-1">
              <Badge variant="neutral">{flag.type}</Badge>
              {isCriticalFlag(flag.key) && <Badge variant="warning">Critical</Badge>}
            </div>
          </header>

          <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] p-3">
            <Label htmlFor="flag-enabled" className="text-sm font-medium">
              Enabled
            </Label>
            <Switch
              id="flag-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-label="Enabled"
            />
          </div>

          {flag.type === 'PERCENTAGE_ROLLOUT' && (
            <div className="space-y-1.5">
              <Label htmlFor="percentage">Rollout percentage (0–100)</Label>
              <Input
                id="percentage"
                type="number"
                min={0}
                max={100}
                step={1}
                value={percentage}
                onChange={(e) => setPercentage(e.target.value)}
                placeholder="Leave blank to clear"
              />
              <p className="text-xs text-[var(--color-fg-muted)]">
                Bucket assignment is hash-stable per user — the same user always lands in the
                same bucket.
              </p>
            </div>
          )}

          {flag.type === 'USER_TARGETED' && (
            <div className="space-y-1.5">
              <Label htmlFor="user-ids">Target user IDs</Label>
              <Textarea
                id="user-ids"
                value={userIds}
                onChange={(e) => setUserIds(e.target.value)}
                placeholder="Comma- or newline-separated, e.g. 12, 88, 401"
                rows={3}
              />
              <p className="text-xs text-[var(--color-fg-muted)]">
                Admins can grant individual users access. IDs are validated as positive
                integers; duplicates are removed.
              </p>
            </div>
          )}

          {flag.type === 'TIER_GATED' && (
            <div className="space-y-2">
              <Label>Required subscription tiers</Label>
              <div className="space-y-1.5 rounded-md border border-[var(--color-border)] p-3">
                {TIERS.map((tier) => (
                  <label key={tier} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={tiers.has(tier)}
                      onCheckedChange={(v) => {
                        const next = new Set(tiers);
                        if (v) next.add(tier);
                        else next.delete(tier);
                        setTiers(next);
                      }}
                    />
                    <span>{tier}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-[var(--color-fg-muted)]">
                A user matching any of the selected tiers passes the flag check.
              </p>
            </div>
          )}

          {flag.type === 'COHORT_TARGETED' && (
            <div className="space-y-2">
              <Label htmlFor="cohort-input">Cohorts</Label>
              <div className="flex gap-2">
                <Input
                  id="cohort-input"
                  value={cohortDraft}
                  onChange={(e) => setCohortDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCohort();
                    }
                  }}
                  placeholder="Type a cohort name and press Enter"
                />
                <Button variant="secondary" size="sm" onClick={addCohort}>
                  Add
                </Button>
              </div>
              {cohorts.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {cohorts.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => removeCohort(c)}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-2.5 py-0.5 text-xs text-[var(--color-fg)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                      aria-label={`Remove ${c}`}
                    >
                      {c}
                      <span aria-hidden>×</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason (required)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Recorded in the audit log."
            />
          </div>

          {error && (
            <div className="rounded-md border border-[var(--color-danger)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm text-[var(--color-danger)]">
              {error}
            </div>
          )}

          <footer className="mt-auto flex items-center justify-end gap-2 border-t border-[var(--color-border)] pt-4">
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={!reasonOk || busy} loading={busy}>
              Save
            </Button>
          </footer>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

