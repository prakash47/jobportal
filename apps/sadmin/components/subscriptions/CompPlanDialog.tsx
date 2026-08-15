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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface CompanyOption {
  id: number;
  name: string;
}
export interface PlanOption {
  id: number;
  name: string;
  tier: string;
  priceInPaise: number;
  intervalDays: number;
}

/**
 * "Comp a plan" — the only way a Subscription can come into existence while the
 * Razorpay storefront is switched off.
 *
 * Writes go through apps/api (POST /admin/billing/subscriptions), never a server
 * action or a Prisma call in the RSC, so AdminGuard, the
 * killswitch.admin_subscription_write flag, the per-company advisory lock and the
 * BILLING_SUBSCRIPTION_GRANTED audit row all apply. There are no server actions
 * anywhere in this monorepo.
 *
 * ⚠ The access_token cookie is HttpOnly and set on the sadmin origin, while the
 * API is a different origin — so this fetch MUST send credentials explicitly.
 * `credentials: 'include'` is what carries it; without it the call arrives
 * unauthenticated and AdminGuard 401s.
 */
export function CompPlanDialog({
  companies,
  plans,
  killed,
}: {
  companies: CompanyOption[];
  plans: PlanOption[];
  /** True when killswitch.admin_subscription_write is ON (the L2 half). */
  killed: boolean;
}) {
  const router = useRouter();
  const companyId = useId();
  const planId = useId();
  const reasonId = useId();

  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState('');
  const [plan, setPlan] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  // Nothing to grant, or nobody to grant it to. Saying which is missing beats a
  // dead button: with no active recruiter plans the answer is to activate one,
  // and with no eligible company the answer is that every company lacks an
  // active owner or admin — two different fixes.
  const unavailableReason =
    plans.length === 0
      ? 'No active recruiter plans exist to grant.'
      : companies.length === 0
        ? 'No company has an active owner or admin to hold a plan.'
        : null;
  const disabled = killed || unavailableReason !== null;

  function reset() {
    setCompany('');
    setPlan('');
    setReason('');
    setError(null);
  }

  async function onSubmit() {
    // Client-side mirror of the DTO. The API enforces all three regardless;
    // checking here avoids a round-trip that can only fail.
    if (!company || !plan) {
      setError('Choose a company and a plan.');
      return;
    }
    if (reason.trim().length === 0) {
      setError('A reason is required — this grants a paid plan for free.');
      return;
    }

    setError(null);
    setLoading(true);
    let res: Response;
    try {
      res = await fetch(`${API_URL}/admin/billing/subscriptions`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: Number(company),
          planId: Number(plan),
          reason: reason.trim(),
        }),
      });
    } catch {
      setLoading(false);
      // fetch only rejects on a transport failure. Naming the URL turns
      // "something went wrong" into an actionable message during local
      // development, matching what lib/admin-api.ts does for the same case.
      setError(`Could not reach the API at ${API_URL}.`);
      return;
    }
    setLoading(false);

    if (!res.ok) {
      setError(await describeApiError(res, 'grant'));
      return;
    }

    setOpen(false);
    reset();
    startTransition(() => router.refresh());
  }

  return (
    <>
      <Button
        type="button"
        onClick={disabled ? undefined : () => { reset(); setOpen(true); }}
        // aria-disabled rather than the disabled attribute: `disabled` drops the
        // control out of the tab order entirely, so a keyboard user cannot reach
        // it and never learns why it is unavailable. Focusable-and-announced is
        // the treatment this console's other inert actions use.
        aria-disabled={disabled || undefined}
        aria-label={
          killed
            ? 'Comp a plan — subscription changes are currently switched off'
            : unavailableReason
              ? `Comp a plan — ${unavailableReason}`
              : 'Comp a plan'
        }
        {...(disabled
          ? { title: killed ? 'Subscription changes are switched off' : unavailableReason ?? '' }
          : {})}
        variant={disabled ? 'secondary' : 'primary'}
      >
        Comp a plan
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Comp a plan</DialogTitle>
            <DialogDescription>
              Grants a recruiter plan to a company without a payment. It takes effect immediately
              and no invoice is raised — a comp moves no money, so it has no GST and must not enter
              the invoice sequence. The company&rsquo;s owner holds the plan.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={companyId}>Company</Label>
              {/* A native select rather than the design system's Radix Select:
                  every form in this portal (LoginForm, JobDecisionForm) uses
                  native controls, and a native listbox is what keeps this usable
                  when the company list grows past a scrollable popover. Styled
                  with the same tokens as SelectTrigger so it matches. */}
              <select
                id={companyId}
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className={FIELD_CLASS}
              >
                <option value="">Select a company…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={planId}>Plan</Label>
              <select
                id={planId}
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                className={FIELD_CLASS}
              >
                <option value="">Select a plan…</option>
                {plans.map((p) => (
                  // The list price is shown so staff can see the value of what
                  // they are giving away before they give it away.
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatInrFromPaise(p.priceInPaise)} / {p.intervalDays} days
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={reasonId}>Reason</Label>
              <Textarea
                id={reasonId}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Why is this being comped?"
                // Recorded on the subscription and in the audit row: it is the
                // only part of the record a future reader cannot reconstruct
                // from the data itself.
                aria-describedby={`${reasonId}-hint`}
              />
              <p id={`${reasonId}-hint`} className="text-xs text-[var(--color-fg-muted)]">
                Stored on the subscription and in the audit log. Required.
              </p>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" loading={loading} onClick={onSubmit}>
              Comp plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
