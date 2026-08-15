'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
import { formatInrFromPaise } from '../../lib/subscriptions/format';
import { FIELD_CLASS, describeApiError } from './shared';
import type { PlanOption } from './CompPlanDialog';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type Action = 'CHANGE_PLAN' | 'EXTEND' | 'CANCEL';

const TITLE: Record<Action, string> = {
  CHANGE_PLAN: 'Change plan',
  EXTEND: 'Extend period',
  CANCEL: 'Cancel subscription',
};

/**
 * Change plan / Extend / Cancel, on the subscription detail page.
 *
 * ⚠ Rendered inert for a GATEWAY-PAID subscription. Per the owner's 2026-08-15
 * ruling staff cannot override billing, so only a comped subscription
 * (`grantedAt` non-null) is mutable — the API refuses the rest with a 409, and
 * offering buttons that always fail would be worse than not offering them.
 *
 * This is UX only. AdminBillingService.update re-checks `grantedAt` server-side
 * and is the actual boundary (CLAUDE.md §4 — the API layer is the only trusted
 * enforcement point).
 */
export function SubscriptionActions({
  subscriptionId,
  currentPlanId,
  plans,
  granted,
  killed,
  canMutateState,
}: {
  subscriptionId: number;
  currentPlanId: number;
  plans: PlanOption[];
  /** grantedAt !== null — this subscription was comped, not bought. */
  granted: boolean;
  /** True when killswitch.admin_subscription_write is ON (the L2 half). */
  killed: boolean;
  /**
   * False once the subscription is CANCELLED. Change-plan and Extend are refused
   * on a terminal row by the API ("comp a new one instead"); Cancel is a no-op.
   */
  canMutateState: boolean;
}) {
  const router = useRouter();
  const planFieldId = useId();
  const daysFieldId = useId();
  const reasonId = useId();

  const [action, setAction] = useState<Action | null>(null);
  const [plan, setPlan] = useState(String(currentPlanId));
  const [days, setDays] = useState('30');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  function open(next: Action) {
    setAction(next);
    setPlan(String(currentPlanId));
    setDays('30');
    setReason('');
    setError(null);
  }

  const blockedReason = !granted
    ? 'this subscription was paid for through the payment gateway'
    : killed
      ? 'subscription changes are currently switched off'
      : null;

  async function onSubmit() {
    if (!action) return;
    if (reason.trim().length === 0) {
      setError('A reason is required — this changes a paid plan.');
      return;
    }

    let body: Record<string, unknown>;
    if (action === 'CHANGE_PLAN') {
      if (!plan) {
        setError('Choose a plan.');
        return;
      }
      body = { action, planId: Number(plan), reason: reason.trim() };
    } else if (action === 'EXTEND') {
      const parsed = Number(days);
      // Mirrors the DTO's bounds so an obviously bad value never round-trips.
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 730) {
        setError('Enter a whole number of days between 1 and 730.');
        return;
      }
      body = { action, days: parsed, reason: reason.trim() };
    } else {
      body = { action, reason: reason.trim() };
    }

    setError(null);
    setLoading(true);
    let res: Response;
    try {
      res = await fetch(`${API_URL}/admin/billing/subscriptions/${subscriptionId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      setLoading(false);
      setError(`Could not reach the API at ${API_URL}.`);
      return;
    }
    setLoading(false);

    if (!res.ok) {
      setError(await describeApiError(res, 'update'));
      return;
    }

    setAction(null);
    // The change rewrites the status, the period and which controls render, so
    // re-render the server component rather than navigating away.
    startTransition(() => router.refresh());
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <ActionButton
          label="Change plan"
          onClick={() => open('CHANGE_PLAN')}
          blockedReason={blockedReason ?? (canMutateState ? null : 'this subscription is cancelled')}
        />
        <ActionButton
          label="Extend"
          onClick={() => open('EXTEND')}
          blockedReason={blockedReason ?? (canMutateState ? null : 'this subscription is cancelled')}
        />
        <ActionButton
          label="Cancel plan"
          danger
          onClick={() => open('CANCEL')}
          blockedReason={blockedReason ?? (canMutateState ? null : 'this subscription is cancelled')}
        />
      </div>

      {/* The visible explanation. This surface has no column that already states
          why the controls are inert, so without it the only cue is a `title`
          tooltip — mouse-only, leaving a sighted keyboard admin pressing Enter
          on a dead control with nothing on screen telling them why.
          aria-hidden because each button's aria-label already carries the same
          words; without it a screen reader announces the reason four times. */}
      {blockedReason && (
        <p aria-hidden="true" className="text-sm text-[var(--color-fg-muted)]">
          These actions are unavailable because {blockedReason}.
        </p>
      )}

      <Dialog open={action !== null} onOpenChange={(next) => !next && setAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action ? TITLE[action] : ''}</DialogTitle>
            <DialogDescription>
              {action === 'CHANGE_PLAN' &&
                'Repoints this subscription at a different plan. The period is left exactly as it is — no money moved either way, so there is nothing to prorate. The new tier applies immediately.'}
              {action === 'EXTEND' &&
                'Adds days to the period. A subscription that is still running is extended from its existing end date; one that has already lapsed is extended from today, so the time is not spent on days that have already passed.'}
              {action === 'CANCEL' &&
                'Ends the entitlement immediately. The period dates are kept as the record of what was granted, and no refund is issued — a comp was never paid for.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {action === 'CHANGE_PLAN' && (
              <div className="space-y-1.5">
                <Label htmlFor={planFieldId}>New plan</Label>
                <select
                  id={planFieldId}
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  className={FIELD_CLASS}
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {formatInrFromPaise(p.priceInPaise)} / {p.intervalDays} days
                      {p.id === currentPlanId ? ' (current)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {action === 'EXTEND' && (
              <div className="space-y-1.5">
                <Label htmlFor={daysFieldId}>Days to add</Label>
                <input
                  id={daysFieldId}
                  type="number"
                  min={1}
                  max={730}
                  step={1}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  className={FIELD_CLASS}
                />
                <p className="text-xs text-[var(--color-fg-muted)]">
                  Between 1 and 730 days. Extend twice for longer.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor={reasonId}>Reason</Label>
              <Textarea
                id={reasonId}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Why is this being changed?"
                aria-describedby={`${reasonId}-hint`}
              />
              <p id={`${reasonId}-hint`} className="text-xs text-[var(--color-fg-muted)]">
                Recorded in the audit log against your account. Required.
              </p>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setAction(null)}>
              Close
            </Button>
            <Button
              type="button"
              variant={action === 'CANCEL' ? 'danger' : 'primary'}
              loading={loading}
              onClick={onSubmit}
            >
              {action ? TITLE[action] : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// aria-disabled rather than the disabled attribute, for the reason spelled out in
// DeleteJobPostingButton: `disabled` drops the control out of the tab order, so a
// keyboard user cannot reach it and never learns why it is unavailable.
//
// The danger tone is earned only when the action can actually happen — a red
// control that refuses to fire promises something false.
function ActionButton({
  label,
  onClick,
  blockedReason,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  blockedReason: string | null;
  danger?: boolean;
}) {
  const disabled = blockedReason !== null;
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled || undefined}
      aria-label={disabled ? `${label} — ${blockedReason}` : label}
      {...(disabled ? { title: blockedReason } : {})}
      className={
        disabled
          ? 'cursor-not-allowed rounded border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-fg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]'
          : `rounded border px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] ${
              danger
                ? 'border-[var(--color-danger)] text-[var(--color-danger)] hover:bg-[var(--color-bg-muted)]'
                : 'border-[var(--color-border-strong)] text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]'
            }`
      }
    >
      {label}
    </button>
  );
}
