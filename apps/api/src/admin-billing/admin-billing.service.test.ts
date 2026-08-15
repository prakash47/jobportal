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
    // ⚠ These mocks are keyed on the FLAG KEY, not a blanket true/false.
    //
    // The first version of these tests did `flag.mockResolvedValue(true)`, which
    // answers true for every key — so they passed identically with the emergency
    // stop wired to the wrong flag, or to a typo'd string that exists nowhere.
    // A killswitch test that cannot tell which switch it is testing is the same
    // class of vacuous test this repo has shipped twice before.
    const KILL = 'killswitch.admin_subscription_write';
    function killswitch(on: boolean) {
      flag.mockImplementation(async (key: string) => (key === KILL ? on : false));
    }

    it('503s the grant and writes nothing when ON', async () => {
      killswitch(true);
      await expect(service.grant(ADMIN, grantInput)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(m.subscription.create).not.toHaveBeenCalled();
      expect(m.profileAuditLog.create).not.toHaveBeenCalled();
      expect(m.$transaction).not.toHaveBeenCalled();
    });

    it('503s an update and writes nothing when ON', async () => {
      killswitch(true);
      await expect(
        service.update(ADMIN, 900, { action: 'CANCEL', reason: 'r' }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(m.subscription.update).not.toHaveBeenCalled();
      expect(m.profileAuditLog.create).not.toHaveBeenCalled();
    });

    it('consults exactly the admin_subscription_write key', async () => {
      killswitch(false);
      await service.grant(ADMIN, grantInput);
      expect(flag.mock.calls.map((c) => c[0])).toContain(KILL);
    });

    // Wiring the guard to any OTHER key must not stop the write. Simulated by
    // turning a different killswitch on and asserting the grant still proceeds —
    // which fails if the service reads the wrong key.
    it('is not gated by a different killswitch', async () => {
      flag.mockImplementation(async (key: string) => key === 'killswitch.admin_job_delete');
      await service.grant(ADMIN, grantInput);
      expect(m.subscription.create).toHaveBeenCalled();
    });

    // Polarity guard. A killswitch is seeded OFF and means "kill it when ON" —
    // the OPPOSITE of a feature toggle like moderation.reports.enabled, which
    // throws on !enabled. Copying that one verbatim would disable comping for
    // everyone, silently. This pins the direction.
    it('permits the write when the flag is OFF', async () => {
      killswitch(false);
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
      const call = m.$executeRaw.mock.calls[0];
      const values = call?.slice(1);
      expect(values).toContain('billing:company:7');
      // The SQL half of the contract too. The interpolated value alone does not
      // pin the lock: the same string handed to a different function, or to no
      // lock at all, would satisfy a value-only assertion while silently
      // removing the mutual exclusion with activatePaidOrder.
      const sql = (call?.[0] as unknown as string[]).join('?');
      expect(sql).toContain('pg_advisory_xact_lock');
      expect(sql).toContain('hashtext');
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

    /**
     * update() reads the row TWICE and the distinction is the point: a minimal
     * pre-transaction read that only yields the lock key, then a full re-read
     * INSIDE the advisory lock from which every guard and every date is derived.
     *
     * `inLock` lets a test make the second read differ from the first — i.e.
     * simulate another admin committing while this request was queued on the
     * lock. That is the only way to prove the guards consume the fresh row.
     */
    function existing(over: Record<string, unknown> = {}, inLock?: Record<string, unknown>) {
      m.subscription.findUnique.mockReset();
      // 1. pre-transaction: id + companyId only
      m.subscription.findUnique.mockResolvedValueOnce({ id: 900, companyId: 7 });
      // 2. inside the lock: the row every decision is made from
      m.subscription.findUnique.mockResolvedValueOnce({ ...granted, ...over, ...(inLock ?? {}) });
      // 3+. detail() after commit
      m.subscription.findUnique.mockResolvedValue(DETAIL_ROW);
    }

    it('404s an unknown subscription before taking any lock', async () => {
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
      // EXTEND writes ONLY the date. Writing status:'ACTIVE' was the mechanism
      // that let a stale snapshot resurrect a cancelled subscription; not
      // writing the column removes it entirely. cancelAtPeriodEnd is the
      // recruiter's own do-not-renew wish and is likewise left alone.
      expect(data.status).toBeUndefined();
      expect(data.cancelAtPeriodEnd).toBeUndefined();
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
    it('cancels by status AND truncates the period to the cancellation instant', async () => {
      existing();
      await service.update(ADMIN, 900, { action: 'CANCEL', reason: 'spam' });
      const data = m.subscription.update.mock.calls[0]?.[0].data;
      expect(data.status).toBe('CANCELLED');
      expect(data.cancelReason).toBe('spam');
      expect(data.cancelledAt).toBeInstanceOf(Date);
      // The recruiter's own billing card renders "Ended on {currentPeriodEnd}",
      // so leaving a future date there would tell the company their access ended
      // on a day that has not happened yet.
      expect(data.currentPeriodEnd).toBeInstanceOf(Date);
      expect(data.currentPeriodEnd.getTime()).toBeLessThan(granted.currentPeriodEnd.getTime());
    });

    it('records the cut-short period in the audit diff, not on the row', async () => {
      existing();
      await service.update(ADMIN, 900, { action: 'CANCEL', reason: 'spam' });
      const diff = m.profileAuditLog.create.mock.calls[0]?.[0].data.diff;
      expect(diff.currentPeriodEnd.before).toBe(granted.currentPeriodEnd.toISOString());
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

    // --- read-modify-write under the lock ----------------------------------
    //
    // update() reads the row twice: once before the transaction (only to 404 and
    // to learn the lock key) and again INSIDE the lock, from which every guard
    // and every date is computed. These four tests make the second read return
    // something DIFFERENT from the first — i.e. another admin committed while
    // this request was queued on the lock — and assert the fresh row wins.
    //
    // The original implementation read once up front and computed everything
    // from that snapshot. It passed every other test in this file, because they
    // all feed the same row to both reads.

    it('re-reads the row inside the lock rather than trusting the pre-lock read', async () => {
      existing();
      await service.update(ADMIN, 900, { action: 'CANCEL', reason: 'r' });
      // Two reads before detail(): the minimal pre-read and the in-lock re-read.
      const selects = m.subscription.findUnique.mock.calls.map((c) => c[0].select);
      expect(selects[0]).toEqual({ id: true, companyId: true });
      expect(selects[1]).toHaveProperty('grantedAt', true);
      expect(selects[1]).toHaveProperty('currentPeriodEnd', true);
    });

    it('refuses EXTEND when the row was CANCELLED while this request waited', async () => {
      existing({}, { status: 'CANCELLED' });
      await expect(
        service.update(ADMIN, 900, { action: 'EXTEND', days: 30, reason: 'r' }),
      ).rejects.toBeInstanceOf(ConflictException);
      // The resurrection this guards: a stale snapshot would have written
      // currentPeriodEnd (and, before the fix, status:'ACTIVE') straight over a
      // cancellation that had already committed.
      expect(m.subscription.update).not.toHaveBeenCalled();
    });

    it('refuses a mutation when the row became gateway-paid while this request waited', async () => {
      existing({}, { grantedAt: null });
      await expect(
        service.update(ADMIN, 900, { action: 'CANCEL', reason: 'r' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(m.subscription.update).not.toHaveBeenCalled();
    });

    it('extends from the value read INSIDE the lock, not the pre-lock snapshot', async () => {
      // Another admin extended by 10 days while this request was queued.
      const fresher = new Date(granted.currentPeriodEnd.getTime() + 10 * 24 * 3600 * 1000);
      existing({}, { currentPeriodEnd: fresher });
      await service.update(ADMIN, 900, { action: 'EXTEND', days: 30, reason: 'r' });
      const data = m.subscription.update.mock.calls[0]?.[0].data;
      // Must be fresher + 30d. Computing from the stale snapshot would silently
      // swallow the other admin's 10 days — a lost update with two audit rows
      // each claiming their days were added.
      expect(data.currentPeriodEnd.getTime()).toBe(fresher.getTime() + 30 * 24 * 3600 * 1000);
    });

    it('refuses if the subscription changed company between the two reads', async () => {
      existing({}, { companyId: 999 });
      await expect(
        service.update(ADMIN, 900, { action: 'CANCEL', reason: 'r' }),
      ).rejects.toBeInstanceOf(ConflictException);
      // The lock was taken on company 7; a row now owned by 999 is not protected
      // by it, so writing would be writing unserialised.
      expect(m.subscription.update).not.toHaveBeenCalled();
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
