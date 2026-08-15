import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    subscription: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    subscriptionPlan: { findUnique: vi.fn() },
    subscriptionInvoice: { create: vi.fn() },
    company: { findUnique: vi.fn() },
    recruiter: { findMany: vi.fn() },
    profileAuditLog: { create: vi.fn() },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  },
  Prisma: {},
}));

vi.mock('@jobportal/feature-flags', () => ({
  FLAG: { KILL_ADMIN_SUBSCRIPTION_WRITE: 'killswitch.admin_subscription_write' },
  isFlagEnabled: vi.fn(),
}));

import { prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { AdminBillingService } from './admin-billing.service';

type Mock = ReturnType<typeof vi.fn>;
const m = prisma as unknown as {
  subscription: { findFirst: Mock; findUnique: Mock; create: Mock; update: Mock };
  subscriptionPlan: { findUnique: Mock };
  subscriptionInvoice: { create: Mock };
  company: { findUnique: Mock };
  recruiter: { findMany: Mock };
  profileAuditLog: { create: Mock };
  $transaction: Mock;
  $executeRaw: Mock;
};
const flag = isFlagEnabled as unknown as Mock;

const ADMIN = 42;
const RECRUITER_PLAN = {
  id: 5,
  slug: 'recruiter-growth-monthly',
  tier: 'PREMIUM',
  audience: 'RECRUITER',
  isActive: true,
  intervalDays: 30,
  priceInPaise: 499900,
};
const DETAIL_ROW = { id: 900, status: 'ACTIVE', plan: { slug: 'recruiter-growth-monthly' } };

describe('AdminBillingService', () => {
  let service: AdminBillingService;

  beforeEach(() => {
    vi.resetAllMocks();
    m.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
    m.$executeRaw.mockResolvedValue(1);
    m.profileAuditLog.create.mockResolvedValue({});
    m.subscription.create.mockResolvedValue({ id: 900 });
    m.subscription.update.mockResolvedValue({});
    m.subscription.findUnique.mockResolvedValue(DETAIL_ROW);
    m.subscriptionPlan.findUnique.mockResolvedValue(RECRUITER_PLAN);
    m.company.findUnique.mockResolvedValue({ id: 7, name: 'Acme' });
    m.recruiter.findMany.mockResolvedValue([{ userId: 11, companyRole: 'OWNER' }]);
    m.subscription.findFirst.mockResolvedValue(null);
    flag.mockResolvedValue(false);
    service = new AdminBillingService();
  });

  const grantInput = { companyId: 7, planId: 5, reason: 'launch partner' };

  // --- the killswitch (L3) -------------------------------------------------

  describe('killswitch.admin_subscription_write', () => {
    it('503s the grant and writes nothing when ON', async () => {
      flag.mockResolvedValue(true);
      await expect(service.grant(ADMIN, grantInput)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(m.subscription.create).not.toHaveBeenCalled();
      expect(m.profileAuditLog.create).not.toHaveBeenCalled();
      expect(m.$transaction).not.toHaveBeenCalled();
    });

    it('503s an update and writes nothing when ON', async () => {
      flag.mockResolvedValue(true);
      await expect(
        service.update(ADMIN, 900, { action: 'CANCEL', reason: 'r' }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(m.subscription.update).not.toHaveBeenCalled();
      expect(m.profileAuditLog.create).not.toHaveBeenCalled();
    });

    // Polarity guard. A killswitch is seeded OFF and means "kill it when ON" —
    // the OPPOSITE of a feature toggle like moderation.reports.enabled, which
    // throws on !enabled. Copying that one verbatim would disable comping for
    // everyone, silently. This pins the direction.
    it('permits the write when the flag is OFF', async () => {
      flag.mockResolvedValue(false);
      await service.grant(ADMIN, grantInput);
      expect(m.subscription.create).toHaveBeenCalled();
    });
  });

  // --- grant ---------------------------------------------------------------

  describe('grant', () => {
    it('creates an ACTIVE subscription carrying its grant provenance', async () => {
      await service.grant(ADMIN, grantInput);
      const data = m.subscription.create.mock.calls[0]?.[0].data;
      expect(data.companyId).toBe(7);
      expect(data.planId).toBe(5);
      expect(data.userId).toBe(11);
      expect(data.status).toBe('ACTIVE');
      expect(data.grantedById).toBe(ADMIN);
      expect(data.grantNote).toBe('launch partner');
      expect(data.grantedAt).toBeInstanceOf(Date);
    });

    it('sets the period end from the plan interval', async () => {
      await service.grant(ADMIN, grantInput);
      const data = m.subscription.create.mock.calls[0]?.[0].data;
      const span = data.currentPeriodEnd.getTime() - data.currentPeriodStart.getTime();
      expect(span).toBe(30 * 24 * 60 * 60 * 1000);
    });

    // The lock key is a literal contract with recruiter-billing.service.ts's
    // activatePaidOrder. A different string hashes to a different advisory lock,
    // the two paths stop excluding each other, and a Razorpay capture landing
    // mid-comp can leave two live subscriptions on one company.
    it('takes the same per-company advisory lock the purchase path takes', async () => {
      await service.grant(ADMIN, grantInput);
      expect(m.$executeRaw).toHaveBeenCalled();
      const values = m.$executeRaw.mock.calls[0]?.slice(1);
      expect(values).toContain('billing:company:7');
    });

    it('refuses to stack a second live subscription on one company', async () => {
      m.subscription.findFirst.mockResolvedValue({ id: 1 });
      await expect(service.grant(ADMIN, grantInput)).rejects.toBeInstanceOf(ConflictException);
      expect(m.subscription.create).not.toHaveBeenCalled();
    });

    it('scopes the duplicate check to live, in-period recruiter subscriptions', async () => {
      await service.grant(ADMIN, grantInput);
      const where = m.subscription.findFirst.mock.calls[0]?.[0].where;
      expect(where.companyId).toBe(7);
      expect(where.status).toEqual({ in: ['ACTIVE', 'TRIALING'] });
      expect(where.plan).toEqual({ audience: 'RECRUITER' });
      expect(where.currentPeriodEnd.gt).toBeInstanceOf(Date);
    });

    it('writes the audit row inside the same transaction as the create', async () => {
      await service.grant(ADMIN, grantInput);
      const audit = m.profileAuditLog.create.mock.calls[0]?.[0].data;
      expect(audit.userId).toBe(ADMIN);
      expect(audit.action).toBe('BILLING_SUBSCRIPTION_GRANTED');
      expect(audit.diff.reason).toBe('launch partner');
      expect(audit.diff.planSlug).toBe('recruiter-growth-monthly');
      expect(audit.diff.listPriceInPaise).toBe(499900);
    });

    // A comp moves no money, so it must not enter the FY-consecutive GST
    // sequence. Asserted rather than assumed: this is a tax-compliance decision.
    it('never issues an invoice', async () => {
      await service.grant(ADMIN, grantInput);
      expect(m.subscriptionInvoice.create).not.toHaveBeenCalled();
    });

    it('404s an unknown plan or company', async () => {
      m.subscriptionPlan.findUnique.mockResolvedValue(null);
      await expect(service.grant(ADMIN, grantInput)).rejects.toBeInstanceOf(NotFoundException);
      m.subscriptionPlan.findUnique.mockResolvedValue(RECRUITER_PLAN);
      m.company.findUnique.mockResolvedValue(null);
      await expect(service.grant(ADMIN, grantInput)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a candidate-audience plan', async () => {
      m.subscriptionPlan.findUnique.mockResolvedValue({ ...RECRUITER_PLAN, audience: 'CANDIDATE' });
      await expect(service.grant(ADMIN, grantInput)).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses an inactive plan', async () => {
      m.subscriptionPlan.findUnique.mockResolvedValue({ ...RECRUITER_PLAN, isActive: false });
      await expect(service.grant(ADMIN, grantInput)).rejects.toBeInstanceOf(ConflictException);
    });

    // isPublic governs the storefront, not whether a plan is real. An unlisted
    // plan is exactly what a negotiated comp is for.
    it('allows a non-public plan', async () => {
      m.subscriptionPlan.findUnique.mockResolvedValue({ ...RECRUITER_PLAN, isPublic: false });
      await expect(service.grant(ADMIN, grantInput)).resolves.toBeDefined();
    });

    it('prefers the OWNER over an ADMIN as the holder', async () => {
      m.recruiter.findMany.mockResolvedValue([
        { userId: 21, companyRole: 'ADMIN' },
        { userId: 22, companyRole: 'OWNER' },
      ]);
      await service.grant(ADMIN, grantInput);
      expect(m.subscription.create.mock.calls[0]?.[0].data.userId).toBe(22);
    });

    it('falls back to an ADMIN when the owner seat is vacant', async () => {
      m.recruiter.findMany.mockResolvedValue([{ userId: 21, companyRole: 'ADMIN' }]);
      await service.grant(ADMIN, grantInput);
      expect(m.subscription.create.mock.calls[0]?.[0].data.userId).toBe(21);
    });

    it('refuses when the company has no active owner or admin to hold it', async () => {
      m.recruiter.findMany.mockResolvedValue([]);
      await expect(service.grant(ADMIN, grantInput)).rejects.toBeInstanceOf(ConflictException);
      expect(m.subscription.create).not.toHaveBeenCalled();
    });

    it('excludes deactivated recruiters from holding a plan', async () => {
      await service.grant(ADMIN, grantInput);
      expect(m.recruiter.findMany.mock.calls[0]?.[0].where.deactivatedAt).toBeNull();
    });
  });

  // --- update: the no-override rule ----------------------------------------

  describe('update', () => {
    const granted = {
      id: 900,
      companyId: 7,
      planId: 5,
      status: 'ACTIVE',
      currentPeriodEnd: new Date(Date.now() + 10 * 24 * 3600 * 1000),
      grantedAt: new Date('2026-08-01T00:00:00.000Z'),
      plan: { slug: 'recruiter-growth-monthly' },
    };

    function existing(over: Record<string, unknown> = {}) {
      m.subscription.findUnique.mockReset();
      m.subscription.findUnique.mockResolvedValueOnce({ ...granted, ...over });
      m.subscription.findUnique.mockResolvedValue(DETAIL_ROW);
    }

    it('404s an unknown subscription', async () => {
      m.subscription.findUnique.mockReset();
      m.subscription.findUnique.mockResolvedValue(null);
      await expect(
        service.update(ADMIN, 900, { action: 'CANCEL', reason: 'r' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    // THE central guard of this branch, and the owner's 2026-08-15 ruling in
    // code: a gateway-paid subscription is view-only. grantedAt === null is the
    // whole test — a paid row has no grant provenance.
    it.each([
      ['CHANGE_PLAN', { action: 'CHANGE_PLAN', planId: 6, reason: 'r' }],
      ['EXTEND', { action: 'EXTEND', days: 30, reason: 'r' }],
      ['CANCEL', { action: 'CANCEL', reason: 'r' }],
    ] as const)('refuses to %s a gateway-paid subscription', async (_label, input) => {
      existing({ grantedAt: null });
      await expect(service.update(ADMIN, 900, input)).rejects.toBeInstanceOf(ConflictException);
      expect(m.subscription.update).not.toHaveBeenCalled();
      expect(m.profileAuditLog.create).not.toHaveBeenCalled();
    });

    it('extends an in-period subscription from its existing end', async () => {
      existing();
      await service.update(ADMIN, 900, { action: 'EXTEND', days: 30, reason: 'r' });
      const data = m.subscription.update.mock.calls[0]?.[0].data;
      const expected = granted.currentPeriodEnd.getTime() + 30 * 24 * 3600 * 1000;
      expect(data.currentPeriodEnd.getTime()).toBe(expected);
    });

    // Nothing in this product writes SubscriptionStatus.EXPIRED, so a lapsed
    // subscription still reads ACTIVE. Extending from its stale end would spend
    // the comp on time already gone and could leave it still expired.
    it('extends a lapsed subscription from now, not from its stale end', async () => {
      const lapsed = new Date(Date.now() - 40 * 24 * 3600 * 1000);
      existing({ currentPeriodEnd: lapsed });
      await service.update(ADMIN, 900, { action: 'EXTEND', days: 30, reason: 'r' });
      const data = m.subscription.update.mock.calls[0]?.[0].data;
      expect(data.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now());
    });

    it('repoints the plan without re-basing the period', async () => {
      existing();
      m.subscriptionPlan.findUnique.mockResolvedValue({ ...RECRUITER_PLAN, id: 6, slug: 'other' });
      await service.update(ADMIN, 900, { action: 'CHANGE_PLAN', planId: 6, reason: 'r' });
      const data = m.subscription.update.mock.calls[0]?.[0].data;
      expect(data).toEqual({ planId: 6 });
    });

    it('is an idempotent no-op when the plan is already the requested one', async () => {
      existing();
      m.subscriptionPlan.findUnique.mockResolvedValue({ ...RECRUITER_PLAN, id: 5 });
      await service.update(ADMIN, 900, { action: 'CHANGE_PLAN', planId: 5, reason: 'r' });
      expect(m.subscription.update).not.toHaveBeenCalled();
      expect(m.profileAuditLog.create).not.toHaveBeenCalled();
    });

    // Status alone ends the entitlement (resolveRecruiterTier requires ACTIVE or
    // TRIALING), so the period is left as the record of what was granted.
    it('cancels by status and preserves the granted period', async () => {
      existing();
      await service.update(ADMIN, 900, { action: 'CANCEL', reason: 'spam' });
      const data = m.subscription.update.mock.calls[0]?.[0].data;
      expect(data.status).toBe('CANCELLED');
      expect(data.cancelReason).toBe('spam');
      expect(data.cancelledAt).toBeInstanceOf(Date);
      expect(data.currentPeriodEnd).toBeUndefined();
    });

    it('refuses to change or extend a terminal subscription', async () => {
      existing({ status: 'CANCELLED' });
      await expect(
        service.update(ADMIN, 900, { action: 'EXTEND', days: 30, reason: 'r' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    // No branch of update() creates a subscription. That is what makes this
    // service structurally incapable of the duplicate-row corruption the
    // Subscription table has no DB constraint against.
    it.each([
      ['CHANGE_PLAN', { action: 'CHANGE_PLAN', planId: 6, reason: 'r' }],
      ['EXTEND', { action: 'EXTEND', days: 30, reason: 'r' }],
      ['CANCEL', { action: 'CANCEL', reason: 'r' }],
    ] as const)('never creates a second row (%s)', async (_label, input) => {
      existing();
      m.subscriptionPlan.findUnique.mockResolvedValue({ ...RECRUITER_PLAN, id: 6, slug: 'other' });
      await service.update(ADMIN, 900, input);
      expect(m.subscription.create).not.toHaveBeenCalled();
    });

    it('takes the per-company advisory lock before mutating', async () => {
      existing();
      await service.update(ADMIN, 900, { action: 'CANCEL', reason: 'r' });
      expect(m.$executeRaw.mock.calls[0]?.slice(1)).toContain('billing:company:7');
    });

    it.each([
      ['CHANGE_PLAN', { action: 'CHANGE_PLAN', planId: 6, reason: 'why' }, 'BILLING_SUBSCRIPTION_PLAN_CHANGED'],
      ['EXTEND', { action: 'EXTEND', days: 30, reason: 'why' }, 'BILLING_SUBSCRIPTION_EXTENDED'],
      ['CANCEL', { action: 'CANCEL', reason: 'why' }, 'BILLING_SUBSCRIPTION_CANCELLED'],
    ] as const)('audits %s as %s with the staff reason', async (_l, input, action) => {
      existing();
      m.subscriptionPlan.findUnique.mockResolvedValue({ ...RECRUITER_PLAN, id: 6, slug: 'other' });
      await service.update(ADMIN, 900, input);
      const audit = m.profileAuditLog.create.mock.calls[0]?.[0].data;
      expect(audit.action).toBe(action);
      expect(audit.userId).toBe(ADMIN);
      expect(audit.diff.reason).toBe('why');
    });
  });
});
