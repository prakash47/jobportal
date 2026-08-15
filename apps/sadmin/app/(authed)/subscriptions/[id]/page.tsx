import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { requireSuperAdmin } from '../../../../lib/auth/require-super-admin';
import { formatDateIst } from '../../../../lib/jobs/format';
import {
  SUBSCRIPTION_STATE_LABEL,
  SUBSCRIPTION_TIER_LABEL,
  clampPage,
  daysUntil,
  deriveSubscriptionState,
  firstParam,
  formatInrFromPaise,
  isAdminGranted,
  normalizeQuery,
  parseSubscriptionTab,
  subscriptionsHref,
} from '../../../../lib/subscriptions/format';
import { getSubscriptionDetail, listGrantablePlans } from '../../../../lib/subscriptions/queries';
import { SubscriptionActions } from '../../../../components/subscriptions/SubscriptionActions';

export const metadata: Metadata = {
  title: 'Subscription — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  // Carried from the master list so Back returns to the exact filtered page the
  // admin left. Typed as Next actually delivers it — a repeated key arrives as
  // an array.
  searchParams: Promise<{
    status?: string | string[];
    q?: string | string[];
    page?: string | string[];
  }>;
}

export default async function SubscriptionDetailPage({ params, searchParams }: PageProps) {
  // Explicit, rather than relying on the (authed) layout alone. A layout is a
  // real boundary, but stating the requirement in the route makes it impossible
  // to move this file out from under that layout and silently lose the check —
  // the same call /candidates/[id] and /job-postings/[id] make. This page is one
  // of the more sensitive in the portal: it shows what a company pays.
  await requireSuperAdmin();

  const { id } = await params;
  // The route is [id], so anything can arrive here. Reject junk before spending a
  // query on it.
  //
  // The digits-only test does real work beyond Number.isInteger: Number() also
  // accepts hex and exponent notation, so without it '0x1a' and '1e1' would
  // resolve to real rows under non-canonical URLs.
  //
  // The upper bound matters more. Subscription.id is a Postgres int4, so an id
  // above 2147483647 does NOT come back as null — it throws out of Prisma
  // ("value is out of range for type integer"). With no segment error.tsx that
  // throw escapes to global-error and answers 500 where an unknown id deserves
  // 404. This is the exact bug class /sadmin/job-postings shipped and fixed.
  //
  // ⚠ This notFound() also depends on there being NO loading.tsx in this segment
  // or its parents — a Suspense boundary flushes the shell first, the response
  // commits 200, and the 404 silently becomes a soft 404.
  const subscriptionId = Number(id);
  if (!/^\d+$/.test(id) || !Number.isInteger(subscriptionId) || subscriptionId < 1) notFound();
  if (subscriptionId > 2_147_483_647) notFound();

  const sp = await searchParams;
  const tab = parseSubscriptionTab(sp.status);
  const q = normalizeQuery(firstParam(sp.q));
  const page = clampPage(firstParam(sp.page));
  const backHref = subscriptionsHref(tab, page, q);

  const [sub, plans, writesKilled] = await Promise.all([
    getSubscriptionDetail(subscriptionId),
    listGrantablePlans(),
    isFlagEnabled('killswitch.admin_subscription_write'),
  ]);

  // getSubscriptionDetail also returns null for a candidate subscription (no
  // company), which this console deliberately does not serve — so an admin who
  // hand-types the id of one gets the same 404 an unknown id gives, rather than a
  // half-rendered page with an empty company block.
  if (!sub) notFound();

  // ONE `now` for the whole render, so the state pill, the days-remaining figure
  // and the action availability cannot disagree with each other.
  const now = new Date();
  const state = deriveSubscriptionState(sub.status, sub.currentPeriodEnd, now);
  const granted = isAdminGranted(sub.grantedAt);
  const remaining = daysUntil(sub.currentPeriodEnd, now);

  return (
    <div data-wide className="space-y-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 rounded text-sm text-[var(--color-primary-700)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
      >
        ← Back to subscriptions
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          {sub.company.name}
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          {sub.plan.name} · {SUBSCRIPTION_TIER_LABEL[sub.plan.tier]} ·{' '}
          {SUBSCRIPTION_STATE_LABEL[state]} · {granted ? 'Comped by staff' : 'Paid via gateway'}
        </p>
      </header>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6">
        <h2 className="text-sm font-semibold text-[var(--color-fg)]">Plan &amp; period</h2>
        <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <Field label="Plan">{sub.plan.name}</Field>
          <Field label="Tier">{SUBSCRIPTION_TIER_LABEL[sub.plan.tier]}</Field>
          {/* "List price", not "Paid": this is the plan's sticker price, and for
              a comped row nobody paid it. It is also GST-INCLUSIVE — plan prices
              are, per apps/api/src/recruiter-billing/gst.ts — so it is labelled
              as the gross figure rather than as revenue. */}
          <Field label="List price (incl. GST)">{formatInrFromPaise(sub.plan.priceInPaise)}</Field>
          <Field label="Billing interval">{sub.plan.intervalDays} days</Field>
          <Field label="Started">{formatDateIst(sub.startedAt)}</Field>
          <Field label="Current period">
            {formatDateIst(sub.currentPeriodStart)} → {formatDateIst(sub.currentPeriodEnd)}
          </Field>
          <Field label="Status">
            {SUBSCRIPTION_STATE_LABEL[state]}
            {/* Says what the derived state means rather than leaving staff to
                reconcile it with the raw column, which for a lapsed row still
                reads ACTIVE — nothing in this product ever writes EXPIRED. */}
            {state === 'ACTIVE' && (
              <span className="block text-xs text-[var(--color-fg-muted)]">
                {remaining === 0 ? 'Ends today' : `${remaining} days remaining`}
              </span>
            )}
            {state === 'LAPSED' && (
              <span className="block text-xs text-[var(--color-fg-muted)]">
                Ended {Math.abs(remaining)} days ago — it grants no access, though the stored status
                still reads {sub.status.toLowerCase()}.
              </span>
            )}
            {state === 'CANCELLED' && sub.cancelledAt && (
              <span className="block text-xs text-[var(--color-fg-muted)]">
                Cancelled {formatDateIst(sub.cancelledAt)}
                {sub.cancelReason ? ` — ${sub.cancelReason}` : ''}
              </span>
            )}
          </Field>
          <Field label="Held by">
            {sub.user.name?.trim() || sub.user.email}
            <span className="block text-xs text-[var(--color-fg-muted)]">
              The plan is company-scoped — it entitles the whole team, not just this account.
            </span>
          </Field>
        </dl>
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6">
        <h2 className="text-sm font-semibold text-[var(--color-fg)]">Source</h2>
        {granted ? (
          <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <Field label="Granted">{sub.grantedAt ? formatDateIst(sub.grantedAt) : '—'}</Field>
            {/* grantedById is a loose Int, not a relation (see the schema note),
                so there is no name to join to. Showing the id is honest; inventing
                a lookup that could break when the account is deleted is not. */}
            <Field label="Granted by">
              {sub.grantedById !== null ? `Admin #${sub.grantedById}` : '—'}
            </Field>
            <Field label="Reason">{sub.grantNote?.trim() || '—'}</Field>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
            Bought through the payment gateway
            {sub.razorpaySubscriptionId ? ` (${sub.razorpaySubscriptionId})` : ''}. Staff cannot
            change a subscription that was paid for — the invoices below are the record of what was
            charged.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--color-fg)]">Actions</h2>
        <SubscriptionActions
          subscriptionId={sub.id}
          currentPlanId={sub.plan.id}
          plans={plans}
          granted={granted}
          killed={writesKilled}
          canMutateState={state !== 'CANCELLED'}
        />
      </section>

      <InvoicesTable invoices={sub.invoices} />
      <OrdersTable orders={sub.orders} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">{label}</dt>
      <dd className="mt-1 text-sm text-[var(--color-fg)]">{children}</dd>
    </div>
  );
}

function InvoicesTable({
  invoices,
}: {
  invoices: Awaited<ReturnType<typeof getSubscriptionDetail>> extends infer T
    ? T extends { invoices: infer I }
      ? I
      : never
    : never;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-[var(--color-fg)]">Invoices</h2>
      {invoices.length === 0 ? (
        <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 text-sm text-[var(--color-fg-muted)]">
          No invoices. A comped plan never raises one — it moves no money, so it has no GST and must
          not enter the invoice sequence.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Invoice
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Plan
                </th>
                {/* Gross and taxable as two SEPARATE columns from day one. Plan
                    prices are GST-inclusive, so conflating them overstates
                    revenue by 18% — the one number an accountant must not be
                    handed wrong. */}
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Gross (incl. GST)
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Taxable
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Paid
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-4 py-3 text-[var(--color-fg)]">{inv.invoiceNumber ?? '—'}</td>
                  {/* The frozen snapshot in preference to the live plan name, so
                      the row keeps matching the PDF after an admin rename. */}
                  <td className="px-4 py-3 text-[var(--color-fg-muted)]">
                    {inv.planNameSnapshot ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--color-fg-muted)]">
                    {formatInrFromPaise(inv.amountInPaise)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--color-fg-muted)]">
                    {inv.taxableInPaise === null ? '—' : formatInrFromPaise(inv.taxableInPaise)}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-fg-muted)]">{inv.status}</td>
                  <td className="px-4 py-3 text-[var(--color-fg-muted)]">
                    {inv.paidAt ? formatDateIst(inv.paidAt) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function OrdersTable({
  orders,
}: {
  orders: NonNullable<Awaited<ReturnType<typeof getSubscriptionDetail>>>['orders'];
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-[var(--color-fg)]">Payment attempts</h2>
        {/* Says whose attempts these are. They are read through the COMPANY, not
            this subscription — PaymentOrder has no subscriptionId — so on a
            company that has bought before, this list is wider than the row above. */}
        <p className="text-xs text-[var(--color-fg-muted)]">
          Every checkout this company has started, including failed and abandoned ones. Not scoped to
          this subscription — payment orders record the attempt, not its outcome.
        </p>
      </div>
      {orders.length === 0 ? (
        <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 text-sm text-[var(--color-fg-muted)]">
          This company has never started a checkout.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Started
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Plan
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Amount
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Detail
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-3 text-[var(--color-fg-muted)]">
                    {formatDateIst(o.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-fg-muted)]">{o.plan.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--color-fg-muted)]">
                    {formatInrFromPaise(o.amountInPaise)}
                  </td>
                  {/* CREATED means the checkout was opened and never completed —
                      "Pending" is how the recruiter's own billing history renders
                      it, and the two surfaces must not disagree. */}
                  <td className="px-4 py-3 text-[var(--color-fg-muted)]">
                    {o.status === 'CREATED' ? 'Pending' : o.status === 'PAID' ? 'Paid' : 'Failed'}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-fg-muted)]">
                    {o.paidAt ? formatDateIst(o.paidAt) : (o.failureReason ?? '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
