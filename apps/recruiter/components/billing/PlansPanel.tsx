'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
} from '@jobportal/ui';
import { Check } from '@jobportal/ui/icons';
import { api } from '../../lib/api-client';
import { BillingDetailsDialog, type BillingProfileData } from './BillingDetailsDialog';
import { loadRazorpayScript, type RazorpayCheckoutResponse } from './checkout';

// Plan cards + the purchase flow. Order creation and pricing are entirely
// server-side (the BFF reads the amount from the plan row); this component
// only opens Razorpay's hosted Checkout with the returned order id and posts
// the handler payload back for HMAC verification. In keyless local dev the
// order response says isStub — the dev-only simulate endpoint completes the
// purchase without a gateway.

export interface PlanCardData {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  priceInPaise: number;
  intervalDays: number;
  tier: string;
  features: string[];
}

interface CreateOrderResponse {
  paymentOrderId: number;
  razorpayOrderId: string;
  keyId: string;
  amountInPaise: number;
  currency: string;
  planName: string;
  isStub: boolean;
  prefill: { name: string; email: string };
}

interface Props {
  plans: PlanCardData[];
  currentPlanId: number | null;
  canManage: boolean;
  hasProfile: boolean;
  profile: BillingProfileData | null;
  kycPrefill: { legalName?: string | null; gstin?: string | null } | null;
}

function formatPrice(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function intervalLabel(days: number): string {
  if (days === 30) return '/month';
  if (days === 365) return '/year';
  return `/${days} days`;
}

export function PlansPanel({
  plans,
  currentPlanId,
  canManage,
  hasProfile,
  profile,
  kycPrefill,
}: Props) {
  const router = useRouter();
  const [busyPlanId, setBusyPlanId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSaved, setProfileSaved] = useState(hasProfile);
  const [savedProfile, setSavedProfile] = useState<BillingProfileData | null>(profile);
  const [pendingPlanId, setPendingPlanId] = useState<number | null>(null);

  function choosePlan(planId: number) {
    setError(null);
    if (!profileSaved) {
      // First purchase — collect the invoice identity, then continue the buy.
      setPendingPlanId(planId);
      setProfileOpen(true);
      return;
    }
    void purchase(planId);
  }

  async function purchase(planId: number) {
    setBusyPlanId(planId);
    // try/catch/finally so a network-level fetch rejection (API down, dropped
    // connection, blocked Razorpay script) can never leave the button stuck
    // spinning with every card disabled. `handedOff` is set only once the
    // Razorpay modal has actually opened — that path keeps busy set (cleared by
    // verify()/ondismiss); every other terminal path clears it in finally.
    let handedOff = false;
    try {
      const res = await api<CreateOrderResponse>('/recruiter/billing/orders', {
        method: 'POST',
        body: JSON.stringify({ planId }),
      });
      if (!res.ok) {
        setError(typeof res.message === 'string' ? res.message : 'Could not start the purchase.');
        return;
      }
      const order = res.data;

      if (order.isStub) {
        // Keyless local dev: no gateway — complete via the dev-only simulator.
        const sim = await api(`/recruiter/billing/orders/${order.paymentOrderId}/simulate`, {
          method: 'POST',
        });
        if (!sim.ok) {
          setError(typeof sim.message === 'string' ? sim.message : 'Simulated payment failed.');
          return;
        }
        onPurchased();
        return;
      }

      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) {
        setError('Could not load the payment window. Check your connection and try again.');
        return;
      }

      // Hand off to the hosted modal. Busy stays set until the modal resolves
      // (handler → verify) or is dismissed (ondismiss). Do NOT clear it here.
      new window.Razorpay({
        key: order.keyId,
        order_id: order.razorpayOrderId,
        amount: order.amountInPaise,
        currency: order.currency,
        name: 'Career Queue',
        description: `${order.planName} plan`,
        prefill: { name: order.prefill.name, email: order.prefill.email },
        theme: { color: '#192249' },
        modal: { ondismiss: () => setBusyPlanId(null) },
        handler: (response: RazorpayCheckoutResponse) => {
          void verify(order.paymentOrderId, response);
        },
      }).open();
      handedOff = true; // modal owns the busy state from here (set only after open() succeeds)
      return;
    } catch {
      setError('Something went wrong starting the purchase. Please try again.');
    } finally {
      if (!handedOff) setBusyPlanId((current) => (current === planId ? null : current));
    }
  }

  async function verify(paymentOrderId: number, response: RazorpayCheckoutResponse) {
    try {
      const res = await api(`/recruiter/billing/orders/${paymentOrderId}/verify`, {
        method: 'POST',
        body: JSON.stringify({
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        }),
      });
      if (!res.ok) {
        // The webhook is the source of truth — a verify blip does not lose money.
        setError(
          (typeof res.message === 'string' ? res.message : 'Payment verification failed.') +
            ' If you were charged, your plan activates automatically within a few minutes.',
        );
        return;
      }
      onPurchased();
    } catch {
      setError(
        'We could not confirm the payment from here. If you were charged, your plan activates automatically within a few minutes — refresh this page shortly.',
      );
    } finally {
      setBusyPlanId(null);
    }
  }

  function onPurchased() {
    router.push('/billing?purchase=success');
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {!canManage && (
        <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-4 py-3 text-sm text-[var(--color-fg-muted)]">
          Only owners and admins can purchase plans. Ask a team owner to upgrade.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          return (
            <Card
              key={plan.id}
              className={cn(
                'flex flex-col',
                isCurrent && 'border-[var(--color-primary-600)]',
              )}
            >
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{plan.name}</CardTitle>
                  {isCurrent && <Badge variant="primary">Current plan</Badge>}
                </div>
                {plan.description && <CardDescription>{plan.description}</CardDescription>}
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
                <p>
                  <span className="text-3xl font-semibold tracking-tight text-[var(--color-fg)]">
                    {formatPrice(plan.priceInPaise)}
                  </span>
                  <span className="text-sm text-[var(--color-fg-muted)]">
                    {intervalLabel(plan.intervalDays)}
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--color-fg-subtle)]">
                    incl. GST
                  </span>
                </p>
                {plan.features.length > 0 && (
                  <ul className="space-y-1.5 text-sm text-[var(--color-fg-muted)]">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check
                          aria-hidden
                          className="mt-0.5 size-4 shrink-0 text-[var(--color-success)]"
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
              {canManage && (
                <CardFooter>
                  <Button
                    className="w-full"
                    variant={isCurrent ? 'secondary' : 'primary'}
                    loading={busyPlanId === plan.id}
                    disabled={busyPlanId !== null && busyPlanId !== plan.id}
                    onClick={() => choosePlan(plan.id)}
                  >
                    {isCurrent ? 'Renew' : currentPlanId ? 'Switch to this plan' : 'Choose plan'}
                  </Button>
                </CardFooter>
              )}
            </Card>
          );
        })}
      </div>

      <BillingDetailsDialog
        open={profileOpen}
        onOpenChange={(open) => {
          setProfileOpen(open);
          if (!open) setPendingPlanId(null);
        }}
        initial={savedProfile}
        prefill={savedProfile ? undefined : (kycPrefill ?? undefined)}
        onSaved={(saved) => {
          setSavedProfile(saved);
          setProfileSaved(true);
          setProfileOpen(false);
          const planId = pendingPlanId;
          setPendingPlanId(null);
          if (planId !== null) void purchase(planId);
        }}
      />
    </div>
  );
}
