// Subscriptions & Billing reads.
//
// Reads/writes split (the repo's topology): these screens are display-only, so
// every row comes straight from Postgres via Prisma inside the RSC — the same
// call lib/job-postings/queries.ts, lib/candidates/queries.ts and
// lib/employers/queries.ts make.
//
// ⚠ Reads ONLY. Comp / Change plan / Extend / Cancel go through apps/api
// (POST|PATCH /admin/billing/subscriptions) so AdminGuard, the
// killswitch.admin_subscription_write flag, the grantedAt "no override" guard,
// the per-company advisory lock and the audit row all apply. A
// prisma.subscription.update() here — or a server action wrapping one — would
// bypass all five, and this file is exactly the convenient place to do it.
//
// ⚠ RECRUITER subscriptions only (owner decision, 2026-08-15). Subscription.companyId
// is nullable so candidate subscriptions can exist, but no candidate plan is
// active and there is no candidate-side console, so every query here is scoped
// to a non-null companyId AND a RECRUITER-audience plan. Both halves are needed:
// scoping on companyId alone would admit a candidate plan that somehow carried
// one, and scoping on audience alone would admit a candidate subscription.

import {
  prisma,
  type Prisma,
  type SubscriptionStatus,
  type SubscriptionTier,
} from '@jobportal/db';
import {
  SUBSCRIPTIONS_PAGE_SIZE,
  escapeLikePattern,
  type SubscriptionTab,
} from './format';

export interface SubscriptionListRow {
  id: number;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  /** Non-null means staff comped this — the console's write permission. */
  grantedAt: Date | null;
  company: { id: number; name: string } | null;
  plan: { name: string; tier: SubscriptionTier; priceInPaise: number };
  /** Invoices raised against this subscription. 0 for every comp. */
  invoiceCount: number;
}

export interface SubscriptionListPage {
  rows: SubscriptionListRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * The `where` for one tab, built once and shared by the count and the page query.
 *
 * A divergence between the two would make the total, the count line, the
 * pagination link count and the over-range redirect all disagree with the
 * visible rows — the trap lib/candidates/queries.ts calls out.
 *
 * The ACTIVE/LAPSED split is a DATE comparison, not a status filter, for the
 * reason written out at deriveSubscriptionState: nothing in this product ever
 * writes SubscriptionStatus.EXPIRED, so "lapsed" exists only as
 * `currentPeriodEnd <= now` on a row that still says ACTIVE. `now` is passed in
 * rather than read here so the count and the page see the same instant — a
 * second `new Date()` between them could put a row on the boundary in one query
 * and not the other.
 */
export function subscriptionWhere(
  tab: SubscriptionTab,
  now: Date,
  q?: string,
): Prisma.SubscriptionWhereInput {
  // Composed as an AND array rather than one merged object, deliberately. The
  // search clause and the LAPSED clause are BOTH `OR`s, and a single object can
  // only hold one `OR` key — merging them would silently drop the search on the
  // Lapsed tab, which is exactly the "clicking a tab wipes the admin's search"
  // failure the shared href builder exists to prevent. Separate AND elements
  // cannot collide.
  const and: Prisma.SubscriptionWhereInput[] = [
    { companyId: { not: null } },
    { plan: { audience: 'RECRUITER' } },
  ];

  if (q) {
    // Escaped, so `?q=%` searches for a literal percent sign instead of matching
    // every company on the platform.
    const contains = escapeLikePattern(q);
    and.push({
      OR: [
        { company: { name: { contains, mode: 'insensitive' } } },
        { plan: { name: { contains, mode: 'insensitive' } } },
      ],
    });
  }

  if (tab === 'CANCELLED') {
    and.push({ status: 'CANCELLED' });
  } else if (tab === 'ACTIVE') {
    and.push({ status: { in: ['ACTIVE', 'TRIALING'] }, currentPeriodEnd: { gt: now } });
  } else if (tab === 'LAPSED') {
    // Everything that is neither live nor cancelled: a period that has run out,
    // plus the PAST_DUE and EXPIRED rows nothing writes today. Expressed as the
    // negation of "live" rather than as a status list, so a status added to the
    // enum later cannot silently fall out of every tab.
    and.push({
      NOT: { status: 'CANCELLED' },
      OR: [{ status: { notIn: ['ACTIVE', 'TRIALING'] } }, { currentPeriodEnd: { lte: now } }],
    });
  }

  return { AND: and };
}

export async function listSubscriptions(
  page: number,
  tab: SubscriptionTab,
  now: Date,
  q?: string,
): Promise<SubscriptionListPage> {
  const where = subscriptionWhere(tab, now, q);

  const [total, rows] = await Promise.all([
    prisma.subscription.count({ where }),
    prisma.subscription.findMany({
      where,
      // currentPeriodEnd desc puts the longest-running plans first on the Active
      // tab and the most recently lapsed first on Lapsed, which is the order
      // staff scan in either case. `id` is the tiebreaker that makes offset
      // pagination deterministic — without it two rows sharing a period end can
      // swap between pages.
      orderBy: [{ currentPeriodEnd: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * SUBSCRIPTIONS_PAGE_SIZE,
      take: SUBSCRIPTIONS_PAGE_SIZE,
      select: {
        id: true,
        status: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        grantedAt: true,
        company: { select: { id: true, name: true } },
        plan: { select: { name: true, tier: true, priceInPaise: true } },
        _count: { select: { invoices: true } },
      },
    }),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      status: r.status,
      currentPeriodStart: r.currentPeriodStart,
      currentPeriodEnd: r.currentPeriodEnd,
      grantedAt: r.grantedAt,
      company: r.company,
      plan: r.plan,
      invoiceCount: r._count.invoices,
    })),
    total,
    page,
    pageSize: SUBSCRIPTIONS_PAGE_SIZE,
  };
}

/**
 * One subscription in full, with its invoices and the company's payment orders.
 *
 * Payment orders are read through the COMPANY rather than the subscription
 * because `PaymentOrder` has no subscriptionId — the link runs the other way,
 * `SubscriptionInvoice.paymentOrderId`, and it is nullable. Reading orders via
 * the invoice join would therefore hide every FAILED and abandoned CREATED
 * attempt, which is precisely the payment status staff open this page to see.
 */
export async function getSubscriptionDetail(id: number) {
  const sub = await prisma.subscription.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      startedAt: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      cancelledAt: true,
      cancelReason: true,
      cancelAtPeriodEnd: true,
      grantedAt: true,
      grantedById: true,
      grantNote: true,
      razorpaySubscriptionId: true,
      company: { select: { id: true, name: true, slug: true } },
      user: { select: { id: true, name: true, email: true } },
      plan: {
        select: { id: true, name: true, slug: true, tier: true, priceInPaise: true, intervalDays: true },
      },
      invoices: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          invoiceNumber: true,
          amountInPaise: true,
          taxableInPaise: true,
          status: true,
          paidAt: true,
          createdAt: true,
          periodStart: true,
          periodEnd: true,
          planNameSnapshot: true,
        },
      },
    },
  });
  if (!sub || !sub.company) return null;

  // Every checkout attempt this company has made, including the failures and
  // abandoned carts that never produced an invoice.
  const orders = await prisma.paymentOrder.findMany({
    where: { companyId: sub.company.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 20,
    select: {
      id: true,
      status: true,
      amountInPaise: true,
      failureReason: true,
      paidAt: true,
      createdAt: true,
      plan: { select: { name: true } },
    },
  });

  return { ...sub, company: sub.company, orders };
}

/**
 * The companies a comp can be granted to, for the Comp-plan form.
 *
 * Only companies with an active OWNER or ADMIN, because Subscription.userId is
 * NOT NULL and AdminBillingService.resolveHolderUserId refuses a company with
 * neither — offering one in the picker would be offering an action that always
 * 409s.
 */
export async function listCompaniesEligibleForComp() {
  return prisma.company.findMany({
    where: {
      recruiters: {
        some: { deactivatedAt: null, companyRole: { in: ['OWNER', 'ADMIN'] } },
      },
    },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}

/** The recruiter plans staff may comp — active only, matching the API's guard. */
export async function listGrantablePlans() {
  return prisma.subscriptionPlan.findMany({
    where: { audience: 'RECRUITER', isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true, tier: true, priceInPaise: true, intervalDays: true },
  });
}
