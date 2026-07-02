import { notFound } from 'next/navigation';
import { prisma } from '@jobportal/db';
import { FLAG, isFlagEnabled } from '@jobportal/feature-flags';
import { Check } from '@jobportal/ui/icons';
import { requireRecruiter } from '../../../lib/auth/require-recruiter';
import {
  PaymentHistoryTable,
  type PaymentHistoryRow,
} from '../../../components/billing/PaymentHistoryTable';
import {
  SubscriptionStatusCard,
  type SubscriptionSummary,
} from '../../../components/billing/SubscriptionStatusCard';
import { BillingProfileCard } from '../../../components/billing/BillingProfileCard';

// SRS §4.11 / §7 — Subscription & invoices. Current plan + expiry, the
// payment/transaction history (incl. pending + failed attempts), and invoice
// downloads. Reads direct via Prisma; the download link streams from the BFF.
// L2 paid gate here; L1 middleware; L3 API.

export const dynamic = 'force-dynamic';

const HISTORY_LIMIT = 50;

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ purchase?: string }>;
}) {
  if (!(await isFlagEnabled(FLAG.SUBSCRIPTION_SYSTEM))) notFound();
  const user = await requireRecruiter();
  const { purchase } = await searchParams;

  const caller = await prisma.recruiter.findUnique({
    where: { userId: user.sub },
    select: { id: true, companyId: true, companyRole: true, deactivatedAt: true },
  });
  if (!caller || caller.deactivatedAt) notFound();

  const canManage = caller.companyRole === 'OWNER' || caller.companyRole === 'ADMIN';

  const now = new Date();
  const [active, latest, orderRows, profileRow, kycRow] = await Promise.all([
    prisma.subscription.findFirst({
      where: {
        companyId: caller.companyId,
        status: { in: ['ACTIVE', 'TRIALING'] },
        currentPeriodEnd: { gt: now },
        plan: { audience: 'RECRUITER' },
      },
      orderBy: { currentPeriodEnd: 'desc' },
      select: { status: true, currentPeriodEnd: true, plan: { select: { name: true } } },
    }),
    prisma.subscription.findFirst({
      where: { companyId: caller.companyId, plan: { audience: 'RECRUITER' } },
      orderBy: { currentPeriodEnd: 'desc' },
      select: { status: true, currentPeriodEnd: true, plan: { select: { name: true } } },
    }),
    prisma.paymentOrder.findMany({
      where: { companyId: caller.companyId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      select: {
        id: true,
        createdAt: true,
        amountInPaise: true,
        status: true,
        failureReason: true,
        plan: { select: { name: true } },
        invoice: { select: { id: true, invoiceNumber: true } },
      },
    }),
    prisma.companyBillingProfile.findUnique({ where: { companyId: caller.companyId } }),
    prisma.companyKyc.findUnique({
      where: { companyId: caller.companyId },
      select: { legalName: true, gstNumber: true },
    }),
  ]);

  // Display status is derived at read time — an ACTIVE row whose period lapsed
  // shows as EXPIRED (no cron flips statuses; the tier resolver already treats
  // it as FREE).
  let summary: SubscriptionSummary;
  if (active) {
    summary = {
      planName: active.plan.name,
      status: active.status === 'TRIALING' ? 'TRIALING' : 'ACTIVE',
      periodEnd: active.currentPeriodEnd.toISOString(),
      daysLeft: Math.max(
        0,
        Math.ceil((active.currentPeriodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
      ),
    };
  } else if (latest) {
    summary = {
      planName: latest.plan.name,
      status:
        latest.status === 'CANCELLED'
          ? 'CANCELLED'
          : latest.status === 'PAST_DUE'
            ? 'PAST_DUE'
            : 'EXPIRED',
      periodEnd: latest.currentPeriodEnd.toISOString(),
      daysLeft: null,
    };
  } else {
    summary = { planName: 'Free plan', status: 'FREE', periodEnd: null, daysLeft: null };
  }

  const rows: PaymentHistoryRow[] = orderRows.map((o) => ({
    id: o.id,
    createdAt: o.createdAt.toISOString(),
    planName: o.plan.name,
    amountInPaise: o.amountInPaise,
    status: o.status,
    failureReason: o.failureReason,
    invoiceId: o.invoice?.id ?? null,
    invoiceNumber: o.invoice?.invoiceNumber ?? null,
  }));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          Subscription &amp; invoices
        </h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Your company&rsquo;s current plan, payment history, and downloadable GST invoices.
        </p>
      </header>

      {purchase === 'success' && (
        // fg text on the muted surface (not semantic-green-on-pale-green, which
        // fails WCAG AA and has no dark-mode token) — a green check carries the
        // success meaning without relying on colour for the copy.
        <p
          role="status"
          className="flex items-center gap-2 rounded-md border border-[var(--color-success)] bg-[var(--color-bg-muted)] px-4 py-3 text-sm font-medium text-[var(--color-fg)]"
        >
          <Check aria-hidden className="size-4 shrink-0 text-[var(--color-success)]" />
          Payment successful — your plan is active. The invoice appears below once generated.
        </p>
      )}

      <SubscriptionStatusCard summary={summary} canManage={canManage} />

      {canManage && (
        <BillingProfileCard
          profile={
            profileRow
              ? {
                  legalName: profileRow.legalName,
                  gstin: profileRow.gstin,
                  addressLine1: profileRow.addressLine1,
                  addressLine2: profileRow.addressLine2,
                  city: profileRow.city,
                  state: profileRow.state,
                  pincode: profileRow.pincode,
                  billingEmail: profileRow.billingEmail,
                }
              : null
          }
          kycPrefill={kycRow ? { legalName: kycRow.legalName, gstin: kycRow.gstNumber } : null}
        />
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-fg)]">Payments &amp; invoices</h2>
          <p className="mt-0.5 text-sm text-[var(--color-fg-muted)]">
            {canManage
              ? 'Every payment attempt, with a downloadable tax invoice for successful ones.'
              : 'Payment history is visible to your team; invoice downloads are limited to owners and admins.'}
          </p>
        </div>
        <PaymentHistoryTable rows={rows} canDownload={canManage} />
      </section>
    </div>
  );
}
