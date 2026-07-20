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
import { FreePlanCard } from './FreePlanCard';
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
  /**
   * Whether this specific plan can be bought right now — the master
   * subscription.system.enabled AND this tier's subscription.plans.<tier>.enabled.
   * False renders a disabled "Coming soon" CTA instead of hiding the card, so
   * recruiters can always review pricing. The API re-checks both flags.
   */
  purchasable: boolean;
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
  /**
   * The master subscription.system.enabled. When false NOTHING is buyable yet,
   * which changes the banner copy — telling a Member "ask a team owner to
   * upgrade" would be wrong when even an owner can't purchase.
   */
  purchaseEnabled: boolean;
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
  purchaseEnabled,
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

  // Note the deliberate present tense on the Free message — the flag system lets
  // an admin move a currently-free capability behind a tier at runtime, so
  // promising that today's features stay free forever isn't a promise this code
  // can keep.
  const banner = !purchaseEnabled
    ? currentPlanId === null
      ? 'Paid plans aren’t open for purchase yet. Your team is on the Free plan, and everything you use today is free. These prices are a preview of what’s coming.'
      : 'Plan changes are paused at the moment. Your current plan stays active — renewals and upgrades will reopen soon.'
    : !canManage
      ? 'Only owners and admins can purchase plans. Ask a team owner to upgrade.'
      : null;

  return (
    <div className="space-y-4">
      {/* Three distinct states. The purchase-closed copy MUST consult
          currentPlanId: a company holding an active paid subscription while an
          admin has the master switch off is not "on the Free plan", and saying
          so would contradict the "Current plan" badge on their own paid card. */}
      {banner && (
        <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-4 py-3 text-sm text-[var(--color-fg-muted)]">
          {banner}
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {/* Four cards (Free + three paid tiers) across on desktop; the page opts
          into the layout's wide column so they don't squeeze. Falls back to
          2-up on small screens and 1-up on mobile. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* The always-present Free plan — current whenever no paid subscription
            is active (currentPlanId is null). Rendered inside the same grid so
            it sits as a peer of the paid cards. */}
        <FreePlanCard isCurrent={currentPlanId === null} />

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
              {!plan.purchasable ? (
                // Visible-but-not-purchasable. Rendered as STATUS TEXT, not a
                // disabled <Button>: nobody can act on it (it isn't a
                // role-denied action), so a dead control would be misleading —
                // and the shared Button's disabled:opacity-50 lands at ~3.4:1,
                // which we can't fix here without editing packages/ui and
                // rippling into apps/web. Muted text is AA and honest.
                <CardFooter>
                  <p className="w-full text-center text-sm font-medium text-[var(--color-fg-muted)]">
                    Coming soon
                  </p>
                </CardFooter>
              ) : canManage ? (
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
              ) : (
                // A Member on a launched tier. Without this the buyable card
                // would render NO footer while an unlaunched sibling shows
                // "Coming soon" — making the tier they can never buy look more
                // complete than the one their owner can.
                <CardFooter>
                  <p className="w-full text-center text-sm font-medium text-[var(--color-fg-muted)]">
                    Owners and admins only
                  </p>
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
