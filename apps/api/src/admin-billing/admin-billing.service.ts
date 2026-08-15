import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { prisma, Prisma } from '@jobportal/db';
import { FLAG, isFlagEnabled } from '@jobportal/feature-flags';
import { addDays, extendFrom } from '../common/billing-period';
import type { GrantSubscriptionInput, UpdateSubscriptionInput } from './dto';

// Statuses that make a subscription "live" for entitlement purposes. Kept
// identical to common/tier-resolver.ts's PAID_IN_PERIOD_STATUSES: if this list
// and that one ever disagree, the console's idea of who holds a plan stops
// matching the resolver that actually grants the access.
const LIVE_STATUSES = ['ACTIVE', 'TRIALING'] as const;

@Injectable()
export class AdminBillingService {
  private readonly logger = new Logger(AdminBillingService.name);

  // Emergency stop for every write in this service. Imported from FLAG rather
  // than written as a bare string literal: recruiter-billing.service.ts — this
  // module's closest sibling — already imports the key map, and keys.ts warns
  // against copying the literal-string style the older quota services use.
  private async assertWritesEnabled(): Promise<void> {
    if (await isFlagEnabled(FLAG.KILL_ADMIN_SUBSCRIPTION_WRITE)) {
      throw new ServiceUnavailableException('Subscription changes are temporarily unavailable');
    }
  }

  /**
   * Comp a recruiter plan to a company (/sadmin/subscriptions → Comp plan).
   *
   * This is the ONLY code path in the product that can create a Subscription
   * without a payment, and today — with the Razorpay gateway unprovisioned and
   * `subscription.system.enabled` OFF — it is the only path that can create one
   * at all.
   *
   * NO INVOICE IS ISSUED, deliberately (owner decision, 2026-08-15). A comp
   * moves no money, so it has no taxable value, no GST and no buyer; writing a
   * zero-rupee row into `invoiceNumber`'s FY-consecutive statutory sequence
   * would corrupt a GST filing to record something that is not a sale. The
   * ProfileAuditLog row is the record of a comp, not SubscriptionInvoice.
   *
   * RECRUITER PLANS ONLY (owner decision, 2026-08-15). `Subscription.companyId`
   * is nullable precisely so candidate subscriptions can exist, but no candidate
   * plan is active and there is no candidate-side console, so a grant here
   * always sets companyId and always targets a RECRUITER-audience plan.
   */
  async grant(adminUserId: number, input: GrantSubscriptionInput) {
    await this.assertWritesEnabled();
    const now = new Date();

    const plan = await this.loadGrantablePlan(input.planId);
    const company = await prisma.company.findUnique({
      where: { id: input.companyId },
      select: { id: true, name: true },
    });
    if (!company) throw new NotFoundException('Company not found');

    // Subscription.userId is NOT NULL, so a company-scoped comp still needs an
    // account to hang off. The purchase flow uses the buyer; a comp has no
    // buyer, so it uses the account that WOULD have bought it — the company's
    // owner, falling back to an admin. Both are exactly the roles
    // RecruiterBillingService.assertCanManageBilling admits, so the holder of a
    // comped plan is always someone who could have paid for it themselves.
    const holderUserId = await this.resolveHolderUserId(input.companyId);

    const created = await prisma.$transaction(async (tx) => {
      // The SAME advisory lock key the Razorpay capture path takes
      // (recruiter-billing.service.ts activatePaidOrder). This is load-bearing
      // and must not be reworded: a different string hashes to a different lock,
      // the two paths would stop excluding each other, and a capture landing
      // while staff comps the same company could leave two live subscriptions
      // on one company — which resolveRecruiterTier's max() would silently
      // absorb while the recruiter's own /billing page rendered a different row.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`billing:company:${input.companyId}`}))`;

      const existing = await tx.subscription.findFirst({
        where: {
          companyId: input.companyId,
          status: { in: [...LIVE_STATUSES] },
          currentPeriodEnd: { gt: now },
          plan: { audience: 'RECRUITER' },
        },
        orderBy: { currentPeriodEnd: 'desc' },
        select: { id: true },
      });
      // Refuse rather than stack a second row. The purchase path handles this
      // case by cancelling the old subscription and creating a new one, but it
      // is reconciling a payment that has already been taken and cannot be
      // refused. Staff have no such constraint: the honest action on a company
      // that already has a plan is to change or extend THAT row, which is what
      // update() below does. Never creating a second row is what keeps this
      // service incapable of producing the duplicate-subscription corruption
      // the table has no constraint against.
      if (existing) {
        throw new ConflictException(
          'This company already has a live subscription — change or extend it instead',
        );
      }

      const periodEnd = addDays(now, plan.intervalDays);
      const sub = await tx.subscription.create({
        data: {
          userId: holderUserId,
          companyId: input.companyId,
          planId: plan.id,
          // ACTIVE, not TRIALING: a comp is a granted plan, not a trial, and
          // TRIALING would misreport it on the recruiter's own billing page.
          // Both resolve to the same entitlement, so this is about honesty.
          status: 'ACTIVE',
          startedAt: now,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          grantedAt: now,
          grantedById: adminUserId,
          grantNote: input.reason,
        },
        select: { id: true },
      });

      await tx.profileAuditLog.create({
        data: {
          userId: adminUserId,
          action: 'BILLING_SUBSCRIPTION_GRANTED',
          diff: {
            subscriptionId: sub.id,
            companyId: input.companyId,
            holderUserId,
            planSlug: plan.slug,
            planTier: plan.tier,
            // The list price this comp gave away, recorded so the audit row
            // states the value of the grant rather than leaving a reader to
            // look up what the plan cost at the time.
            listPriceInPaise: plan.priceInPaise,
            currentPeriodEnd: periodEnd.toISOString(),
            reason: input.reason,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      return sub;
    });

    this.logger.warn(
      `admin=${adminUserId} comped plan=${plan.slug} to company=${input.companyId} (subscription=${created.id})`,
    );
    return this.detail(created.id);
  }

  /**
   * Change plan / extend / cancel an ADMIN-GRANTED subscription.
   *
   * ⚠ The guard that makes this safe is `grantedAt !== null`. Per the owner's
   * 2026-08-15 ruling, staff must not be able to override billing: a
   * subscription bought through Razorpay is view-only in this console, because
   * mutating it would silently desynchronise the row from the invoice, the
   * payment order and the money that actually changed hands. There is no
   * override, and adding one would need the invoice/credit-note story that
   * InvoiceStatus.REFUNDED currently has no writer for.
   *
   * Every branch mutates the EXISTING row in place. None of them creates a
   * second subscription, so — unlike the purchase path's cancel-and-recreate —
   * this service cannot produce two live rows for one company even if the
   * advisory lock were somehow bypassed.
   */
  async update(adminUserId: number, subscriptionId: number, input: UpdateSubscriptionInput) {
    await this.assertWritesEnabled();
    const now = new Date();

    const existing = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: {
        id: true,
        companyId: true,
        planId: true,
        status: true,
        currentPeriodEnd: true,
        grantedAt: true,
        plan: { select: { slug: true } },
      },
    });
    if (!existing) throw new NotFoundException('Subscription not found');
    if (existing.grantedAt === null) {
      throw new ConflictException(
        'This subscription was paid for through the payment gateway and cannot be changed here',
      );
    }
    // Defensive: a grant always sets companyId, so this is unreachable today.
    // Asserted rather than assumed because the advisory lock below is keyed on
    // it, and a null would silently take a lock on the string "null" — i.e. no
    // mutual exclusion at all, which is exactly the failure this service exists
    // to prevent.
    if (existing.companyId === null) {
      throw new ConflictException('This subscription is not company-scoped');
    }
    if (input.action !== 'CANCEL' && !isLive(existing.status)) {
      throw new ConflictException(
        `This subscription is ${existing.status.toLowerCase()} — comp a new one instead`,
      );
    }

    // A plan lookup must happen BEFORE the transaction opens so a bad planId
    // 404s without having taken the company lock.
    const nextPlan =
      input.action === 'CHANGE_PLAN' ? await this.loadGrantablePlan(input.planId) : null;

    // Idempotent no-op, matching AdminSupportService.updateStatus: re-submitting
    // the plan a subscription is already on writes no audit row, because nothing
    // changed and a "changed plan from Growth to Growth" line is noise in the
    // one record that has to stay readable.
    if (nextPlan && nextPlan.id === existing.planId) return this.detail(subscriptionId);
    if (input.action === 'CANCEL' && !isLive(existing.status)) return this.detail(subscriptionId);

    const companyId = existing.companyId;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`billing:company:${companyId}`}))`;

      if (input.action === 'CHANGE_PLAN' && nextPlan) {
        // Repoints the plan and leaves the period alone. There is no proration
        // question because no money moved either way, and re-basing the period
        // would either rob the company of days it had been given or silently
        // hand it more — neither of which the staff member asked for. The new
        // tier takes effect immediately, since resolveRecruiterTier reads
        // plan.tier through this row on every call.
        await tx.subscription.update({
          where: { id: subscriptionId },
          data: { planId: nextPlan.id },
        });
        await tx.profileAuditLog.create({
          data: {
            userId: adminUserId,
            action: 'BILLING_SUBSCRIPTION_PLAN_CHANGED',
            diff: {
              subscriptionId,
              companyId,
              planSlug: { before: existing.plan.slug, after: nextPlan.slug },
              reason: input.reason,
            } as unknown as Prisma.InputJsonValue,
          },
        });
      } else if (input.action === 'EXTEND') {
        // extendFrom, not currentPeriodEnd directly: a subscription whose period
        // has already lapsed still reads status ACTIVE (nothing in this product
        // ever writes EXPIRED), so extending from its stored end would spend the
        // grant on time that has already passed and could leave it still expired.
        const periodEnd = addDays(extendFrom(existing.currentPeriodEnd, now), input.days);
        await tx.subscription.update({
          where: { id: subscriptionId },
          data: { status: 'ACTIVE', currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false },
        });
        await tx.profileAuditLog.create({
          data: {
            userId: adminUserId,
            action: 'BILLING_SUBSCRIPTION_EXTENDED',
            diff: {
              subscriptionId,
              companyId,
              days: input.days,
              currentPeriodEnd: {
                before: existing.currentPeriodEnd.toISOString(),
                after: periodEnd.toISOString(),
              },
              reason: input.reason,
            } as unknown as Prisma.InputJsonValue,
          },
        });
      } else {
        // CANCEL. Status alone ends the entitlement — resolveRecruiterTier
        // requires status IN (ACTIVE, TRIALING) — so currentPeriodEnd is left
        // untouched as the record of what was granted. Truncating it would
        // destroy the only evidence of the period the company actually had.
        await tx.subscription.update({
          where: { id: subscriptionId },
          data: { status: 'CANCELLED', cancelledAt: now, cancelReason: input.reason },
        });
        await tx.profileAuditLog.create({
          data: {
            userId: adminUserId,
            action: 'BILLING_SUBSCRIPTION_CANCELLED',
            diff: {
              subscriptionId,
              companyId,
              status: { before: existing.status, after: 'CANCELLED' },
              planSlug: existing.plan.slug,
              reason: input.reason,
            } as unknown as Prisma.InputJsonValue,
          },
        });
      }
    });

    this.logger.warn(
      `admin=${adminUserId} ${input.action} on granted subscription=${subscriptionId} (company=${companyId})`,
    );
    return this.detail(subscriptionId);
  }

  // The payload every mutation answers with, so the console re-renders from the
  // committed row rather than from what the client hoped it wrote.
  async detail(subscriptionId: number) {
    const sub = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: {
        id: true,
        status: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        cancelledAt: true,
        cancelReason: true,
        grantedAt: true,
        grantedById: true,
        grantNote: true,
        company: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
        plan: { select: { id: true, slug: true, name: true, tier: true, priceInPaise: true } },
      },
    });
    if (!sub) throw new NotFoundException('Subscription not found');
    return sub;
  }

  // A plan staff may comp: it must exist, be a recruiter plan, and be active.
  //
  // isPublic is deliberately NOT required. An unlisted plan is exactly the kind
  // of thing a comp is for (a negotiated enterprise arrangement), and isPublic
  // governs the storefront, not whether the plan is real.
  private async loadGrantablePlan(planId: number) {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId },
      select: {
        id: true,
        slug: true,
        tier: true,
        audience: true,
        isActive: true,
        intervalDays: true,
        priceInPaise: true,
      },
    });
    if (!plan) throw new NotFoundException('Plan not found');
    if (plan.audience !== 'RECRUITER') {
      throw new ConflictException('Only recruiter plans can be granted from this console');
    }
    if (!plan.isActive) throw new ConflictException('That plan is not active');
    return plan;
  }

  private async resolveHolderUserId(companyId: number): Promise<number> {
    const candidates = await prisma.recruiter.findMany({
      where: {
        companyId,
        deactivatedAt: null,
        companyRole: { in: ['OWNER', 'ADMIN'] },
      },
      orderBy: { id: 'asc' },
      select: { userId: true, companyRole: true },
    });
    // Prefer the owner; an ADMIN is the documented second-in-command for billing
    // and is only reached when the owner seat is vacant or deactivated. Ordered
    // by id so a company with two admins resolves deterministically.
    const owner = candidates.find((r) => r.companyRole === 'OWNER');
    const holder = owner ?? candidates[0];
    if (!holder) {
      throw new ConflictException(
        'This company has no active owner or admin to hold a subscription',
      );
    }
    return holder.userId;
  }
}

function isLive(status: string): boolean {
  return (LIVE_STATUSES as readonly string[]).includes(status);
}
