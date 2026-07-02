import { createHmac } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/feature-flags', () => ({
  isFlagEnabled: vi.fn(),
  FLAG: { SUBSCRIPTION_SYSTEM: 'subscription.system.enabled' },
}));
vi.mock('@jobportal/db', () => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  return {
    prisma: {
      recruiter: { findUnique: vi.fn() },
      subscriptionPlan: { findFirst: vi.fn() },
      companyBillingProfile: { findUnique: vi.fn(), upsert: vi.fn() },
      paymentOrder: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
      subscription: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
      subscriptionInvoice: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      paymentWebhookEvent: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
      profileAuditLog: { create: vi.fn() },
      $transaction: vi.fn(),
      $queryRaw: vi.fn(),
    },
    Prisma: { DbNull: { __dbNull: true }, PrismaClientKnownRequestError },
  };
});

import { isFlagEnabled } from '@jobportal/feature-flags';
import { prisma } from '@jobportal/db';
import { fyCode } from './invoice-number';
import { RazorpayClient } from './razorpay.client';
import { RecruiterBillingService } from './recruiter-billing.service';

const mockedFlag = isFlagEnabled as ReturnType<typeof vi.fn>;
type MockFn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
  recruiter: { findUnique: MockFn };
  subscriptionPlan: { findFirst: MockFn };
  companyBillingProfile: { findUnique: MockFn; upsert: MockFn };
  paymentOrder: { create: MockFn; findUnique: MockFn; update: MockFn };
  subscription: { findFirst: MockFn; update: MockFn; create: MockFn };
  subscriptionInvoice: { findUnique: MockFn; findFirst: MockFn; create: MockFn; update: MockFn };
  paymentWebhookEvent: { findUnique: MockFn; create: MockFn; update: MockFn };
  profileAuditLog: { create: MockFn };
  $transaction: MockFn;
  $queryRaw: MockFn;
};

// --- Fixtures -----------------------------------------------------------------

const OWNER = {
  id: 11,
  companyId: 7,
  companyRole: 'OWNER',
  deactivatedAt: null,
  user: { name: 'Priya Sharma', email: 'priya@nimbus.example' },
  company: { name: 'Nimbus Cloud Systems' },
};
const MEMBER = { ...OWNER, companyRole: 'MEMBER' };

const PLAN = {
  id: 31,
  slug: 'recruiter-starter-monthly',
  name: 'Recruiter Starter',
  description: 'x',
  tier: 'BASIC',
  audience: 'RECRUITER',
  priceInPaise: 199900,
  currency: 'INR',
  intervalDays: 30,
  isActive: true,
  isPublic: true,
};

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 501,
    companyId: 7,
    createdByUserId: 1,
    planId: PLAN.id,
    amountInPaise: 199900,
    currency: 'INR',
    status: 'CREATED',
    razorpayOrderId: 'order_X1',
    razorpayPaymentId: null,
    failureReason: null,
    paidAt: null,
    plan: PLAN,
    ...overrides,
  };
}

const PROFILE = {
  id: 1,
  companyId: 7,
  legalName: 'Nimbus Cloud Systems Pvt Ltd',
  gstin: '27AAPFU0939F1ZV',
  addressLine1: '4th Floor, Tower B',
  addressLine2: null,
  city: 'Pune',
  state: 'Maharashtra',
  pincode: '411045',
  billingEmail: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const ENV_KEYS = [
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'BILLING_SELLER_STATE',
  'NODE_ENV',
] as const;
const savedEnv: Record<string, string | undefined> = {};

function makeService() {
  const storage = {
    putObject: vi.fn().mockResolvedValue({ key: 'k', size: 1, contentType: 'application/pdf' }),
    getObject: vi.fn().mockResolvedValue({ body: Buffer.from('%PDF-'), contentType: 'application/pdf' }),
    getSignedDownloadUrl: vi.fn(),
  };
  const email = { enqueuePaymentReceipt: vi.fn().mockResolvedValue(undefined) };
  const razorpay = new RazorpayClient();
  const service = new RecruiterBillingService(razorpay, storage as never, email as never);
  // The PDF/email side effect is exercised by its own tests; activation tests
  // spy it so a pdfkit render never runs inside a mocked-prisma context.
  const artifactsSpy = vi
    .spyOn(
      service as unknown as {
        issueInvoiceArtifacts: (id: number, sendEmail: boolean) => Promise<string>;
      },
      'issueInvoiceArtifacts',
    )
    .mockResolvedValue('invoices/7/INV.pdf');
  return { service, storage, email, artifactsSpy };
}

// Common happy-path prisma wiring for an activation run.
function wireActivation(order = makeOrder()) {
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
  db.$queryRaw.mockResolvedValue([]);
  db.paymentOrder.findUnique.mockResolvedValue(order);
  db.paymentOrder.update.mockResolvedValue({ ...order, status: 'PAID' });
  db.subscription.findFirst.mockResolvedValue(null);
  db.subscription.create.mockResolvedValue({ id: 55 });
  db.subscription.update.mockResolvedValue({ id: 55 });
  db.companyBillingProfile.findUnique.mockResolvedValue(PROFILE);
  db.subscriptionInvoice.findFirst.mockResolvedValue(null); // invoice-number allocator
  db.subscriptionInvoice.create.mockResolvedValue({ id: 99 });
  db.profileAuditLog.create.mockResolvedValue({});
  return order;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  delete process.env['RAZORPAY_KEY_ID']; // stub mode by default
  delete process.env['RAZORPAY_KEY_SECRET'];
  delete process.env['RAZORPAY_WEBHOOK_SECRET'];
  process.env['BILLING_SELLER_STATE'] = 'Maharashtra';
  // Default: master flag ON, tier flags ON (individual tests override).
  mockedFlag.mockResolvedValue(true);
  db.recruiter.findUnique.mockResolvedValue(OWNER);
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

// --- The paid-feature gate (Pattern B) ------------------------------------------

describe('subscription.system.enabled gate', () => {
  it('403s every entry point and writes nothing while the flag is OFF', async () => {
    const { service } = makeService();
    mockedFlag.mockResolvedValue(false);
    const calls: Array<Promise<unknown>> = [
      service.createOrder(1, { planId: 31 }),
      service.verifyCheckout(1, 501, {
        razorpayOrderId: 'o',
        razorpayPaymentId: 'p',
        razorpaySignature: 's',
      }),
      service.upsertBillingProfile(1, {
        legalName: 'X Co',
        addressLine1: 'Street 1',
        city: 'Pune',
        state: 'Maharashtra',
        pincode: '411045',
      }),
      service.getInvoicePdf(1, 99),
    ];
    for (const p of calls) {
      await expect(p).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(db.paymentOrder.create).not.toHaveBeenCalled();
    expect(db.companyBillingProfile.upsert).not.toHaveBeenCalled();
  });
});

// --- createOrder -----------------------------------------------------------------

describe('createOrder', () => {
  it('rejects MEMBERs (owners/admins only)', async () => {
    const { service } = makeService();
    db.recruiter.findUnique.mockResolvedValue(MEMBER);
    await expect(service.createOrder(1, { planId: 31 })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects a deactivated recruiter and a missing recruiter row', async () => {
    const { service } = makeService();
    db.recruiter.findUnique.mockResolvedValueOnce({ ...OWNER, deactivatedAt: new Date() });
    await expect(service.createOrder(1, { planId: 31 })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    db.recruiter.findUnique.mockResolvedValueOnce(null);
    await expect(service.createOrder(1, { planId: 31 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s when the plan is not an active, public recruiter plan', async () => {
    const { service } = makeService();
    db.subscriptionPlan.findFirst.mockResolvedValue(null);
    await expect(service.createOrder(1, { planId: 31 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const where = db.subscriptionPlan.findFirst.mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(where).toMatchObject({
      id: 31,
      audience: 'RECRUITER',
      isActive: true,
      isPublic: true,
    });
  });

  it('rejects a FREE-tier or zero-priced plan', async () => {
    const { service } = makeService();
    db.subscriptionPlan.findFirst.mockResolvedValue({ ...PLAN, tier: 'FREE' });
    await expect(service.createOrder(1, { planId: 31 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('403s while the plan tier launch flag is OFF', async () => {
    const { service } = makeService();
    mockedFlag.mockImplementation(async (key: string) => key === 'subscription.system.enabled');
    db.subscriptionPlan.findFirst.mockResolvedValue(PLAN);
    await expect(service.createOrder(1, { planId: 31 })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('409s until billing details exist', async () => {
    const { service } = makeService();
    db.subscriptionPlan.findFirst.mockResolvedValue(PLAN);
    db.companyBillingProfile.findUnique.mockResolvedValue(null);
    await expect(service.createOrder(1, { planId: 31 })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('creates the order at the PLAN price with an audit row (stub mode)', async () => {
    const { service } = makeService();
    db.subscriptionPlan.findFirst.mockResolvedValue(PLAN);
    db.companyBillingProfile.findUnique.mockResolvedValue({ id: 1 });
    db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prisma),
    );
    db.paymentOrder.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: 501,
      ...args.data,
    }));
    const result = await service.createOrder(1, { planId: 31 });
    expect(result.amountInPaise).toBe(PLAN.priceInPaise);
    expect(result.razorpayOrderId).toMatch(/^order_stub_/);
    expect(result.isStub).toBe(true);
    expect(result.prefill).toEqual({ name: 'Priya Sharma', email: 'priya@nimbus.example' });
    const created = db.paymentOrder.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(created['amountInPaise']).toBe(PLAN.priceInPaise);
    expect(created['companyId']).toBe(7);
    expect(created['createdByUserId']).toBe(1);
    const audit = db.profileAuditLog.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(audit['action']).toBe('BILLING_ORDER_CREATED');
  });
});

// --- verifyCheckout -----------------------------------------------------------------

describe('verifyCheckout', () => {
  const dto = (sig: string) => ({
    razorpayOrderId: 'order_X1',
    razorpayPaymentId: 'pay_Y1',
    razorpaySignature: sig,
  });

  it('404s a cross-company or missing order (no probing)', async () => {
    const { service } = makeService();
    db.paymentOrder.findUnique.mockResolvedValue(makeOrder({ companyId: 999 }));
    await expect(service.verifyCheckout(1, 501, dto('x'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    db.paymentOrder.findUnique.mockResolvedValue(null);
    await expect(service.verifyCheckout(1, 501, dto('x'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('is idempotent for an already-PAID order (no re-verification)', async () => {
    const { service } = makeService();
    db.paymentOrder.findUnique.mockResolvedValue(makeOrder({ status: 'PAID' }));
    db.subscriptionInvoice.findUnique.mockResolvedValue({ id: 99 });
    await expect(service.verifyCheckout(1, 501, dto('garbage'))).resolves.toEqual({
      status: 'active',
      invoiceId: 99,
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('400s an order-id mismatch and a bad signature', async () => {
    process.env['RAZORPAY_KEY_SECRET'] = 'secret-1';
    const { service } = makeService();
    db.paymentOrder.findUnique.mockResolvedValue(makeOrder());
    await expect(
      service.verifyCheckout(1, 501, { ...dto('x'), razorpayOrderId: 'order_OTHER' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.verifyCheckout(1, 501, dto('not-the-hmac'))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('activates on a valid signature: order PAID, subscription created, GST invoice numbered', async () => {
    process.env['RAZORPAY_KEY_SECRET'] = 'secret-1';
    const { service, artifactsSpy } = makeService();
    const order = wireActivation();
    const sig = createHmac('sha256', 'secret-1').update('order_X1|pay_Y1').digest('hex');

    const result = await service.verifyCheckout(1, 501, dto(sig));
    expect(result).toEqual({ status: 'active', invoiceId: 99 });

    expect(db.paymentOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: order.id },
        data: expect.objectContaining({ status: 'PAID', razorpayPaymentId: 'pay_Y1' }),
      }),
    );
    const subData = db.subscription.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(subData).toMatchObject({
      companyId: 7,
      planId: PLAN.id,
      status: 'ACTIVE',
      userId: order.createdByUserId,
    });
    const invData = db.subscriptionInvoice.create.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(invData['invoiceNumber']).toBe(`INV-${fyCode(new Date())}-000001`);
    expect(invData['status']).toBe('PAID');
    expect(invData['amountInPaise']).toBe(199900);
    const audit = db.profileAuditLog.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(audit['action']).toBe('BILLING_SUBSCRIPTION_ACTIVATED');
    expect(artifactsSpy).toHaveBeenCalledWith(99, true);
  });
});

// --- Activation semantics (via the dev-only simulate path, stub mode) ---------------

describe('activation semantics', () => {
  it('renewal of the same plan extends the current period end', async () => {
    const { service } = makeService();
    const order = wireActivation();
    const end = new Date('2026-07-20T00:00:00Z');
    db.subscription.findFirst.mockResolvedValue({
      id: 55,
      planId: PLAN.id,
      currentPeriodStart: new Date('2026-06-20T00:00:00Z'),
      currentPeriodEnd: end,
    });

    await service.simulatePayment(1, order.id);

    expect(db.subscription.create).not.toHaveBeenCalled();
    const update = db.subscription.update.mock.calls[0]?.[0] as {
      where: { id: number };
      data: { currentPeriodEnd: Date; status: string };
    };
    expect(update.where.id).toBe(55);
    expect(update.data.status).toBe('ACTIVE');
    expect(update.data.currentPeriodEnd.getTime()).toBe(
      end.getTime() + PLAN.intervalDays * 24 * 60 * 60 * 1000,
    );
  });

  it('a different plan cancels the old subscription as upgraded and starts fresh', async () => {
    const { service } = makeService();
    const order = wireActivation();
    db.subscription.findFirst.mockResolvedValue({
      id: 44,
      planId: 999, // some other plan
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    });

    await service.simulatePayment(1, order.id);

    expect(db.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 44 },
        data: expect.objectContaining({ status: 'CANCELLED', cancelReason: 'upgraded' }),
      }),
    );
    const created = db.subscription.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(created['planId']).toBe(PLAN.id);
    expect(created['status']).toBe('ACTIVE');
  });

  it('is idempotent: a concurrently-paid order becomes a no-op', async () => {
    const { service, artifactsSpy } = makeService();
    const order = wireActivation();
    // Outer read says CREATED; the locked re-read inside the tx says PAID.
    db.paymentOrder.findUnique
      .mockResolvedValueOnce(order)
      .mockResolvedValueOnce(makeOrder({ status: 'PAID' }));
    db.subscriptionInvoice.findUnique.mockResolvedValue({ id: 99 });

    await expect(service.simulatePayment(1, order.id)).resolves.toEqual({
      status: 'active',
      invoiceId: 99,
    });
    expect(db.paymentOrder.update).not.toHaveBeenCalled();
    expect(db.subscription.create).not.toHaveBeenCalled();
    expect(artifactsSpy).not.toHaveBeenCalled();
  });

  it('intra-state buyers get CGST+SGST; inter-state buyers get IGST', async () => {
    const { service } = makeService();
    const order = wireActivation();
    await service.simulatePayment(1, order.id);
    let inv = db.subscriptionInvoice.create.mock.calls[0]?.[0]?.data as Record<string, number>;
    expect(inv['igstInPaise']).toBe(0);
    expect((inv['cgstInPaise'] ?? 0) + (inv['sgstInPaise'] ?? 0)).toBeGreaterThan(0);

    vi.clearAllMocks();
    mockedFlag.mockResolvedValue(true);
    db.recruiter.findUnique.mockResolvedValue(OWNER);
    wireActivation();
    db.companyBillingProfile.findUnique.mockResolvedValue({ ...PROFILE, state: 'Karnataka' });
    await service.simulatePayment(1, order.id);
    inv = db.subscriptionInvoice.create.mock.calls[0]?.[0]?.data as Record<string, number>;
    expect(inv['igstInPaise']).toBeGreaterThan(0);
    expect(inv['cgstInPaise']).toBe(0);
    expect(inv['placeOfSupply'] as unknown as string).toBe('Karnataka');
  });

  it('invoice numbers continue the FY sequence', async () => {
    const { service } = makeService();
    const order = wireActivation();
    const fy = fyCode(new Date());
    db.subscriptionInvoice.findFirst.mockResolvedValue({ invoiceNumber: `INV-${fy}-000007` });
    await service.simulatePayment(1, order.id);
    const inv = db.subscriptionInvoice.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(inv['invoiceNumber']).toBe(`INV-${fy}-000008`);
  });

  it('simulatePayment 404s when real keys exist or in production', async () => {
    const { service } = makeService();
    process.env['RAZORPAY_KEY_ID'] = 'rzp_test_abc';
    await expect(service.simulatePayment(1, 501)).rejects.toBeInstanceOf(NotFoundException);
    delete process.env['RAZORPAY_KEY_ID'];
    process.env['NODE_ENV'] = 'production';
    await expect(service.simulatePayment(1, 501)).rejects.toBeInstanceOf(NotFoundException);
  });
});

// --- Webhook -----------------------------------------------------------------------

describe('handleWebhook', () => {
  const SECRET = 'hook-secret';

  function signedBody(body: Record<string, unknown>): { raw: Buffer; sig: string } {
    const raw = Buffer.from(JSON.stringify(body));
    return { raw, sig: createHmac('sha256', SECRET).update(raw).digest('hex') };
  }

  function capturedEvent(orderId = 'order_X1', paymentId = 'pay_Y1') {
    return {
      event: 'payment.captured',
      payload: { payment: { entity: { id: paymentId, order_id: orderId } } },
    };
  }

  beforeEach(() => {
    process.env['RAZORPAY_WEBHOOK_SECRET'] = SECRET;
    db.paymentWebhookEvent.findUnique.mockResolvedValue(null);
    db.paymentWebhookEvent.create.mockResolvedValue({});
    db.paymentWebhookEvent.update.mockResolvedValue({});
  });

  it('400s an invalid signature without touching the ledger', async () => {
    const { service } = makeService();
    const { raw } = signedBody(capturedEvent());
    await expect(service.handleWebhook(raw, 'bad-signature', 'evt_1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.handleWebhook(raw, undefined, 'evt_1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db.paymentWebhookEvent.create).not.toHaveBeenCalled();
  });

  it('skips an already-processed event id (replay)', async () => {
    const { service } = makeService();
    const { raw, sig } = signedBody(capturedEvent());
    db.paymentWebhookEvent.findUnique.mockResolvedValue({ processedAt: new Date() });
    await expect(service.handleWebhook(raw, sig, 'evt_1')).resolves.toEqual({
      status: 'duplicate',
    });
    expect(db.paymentOrder.findUnique).not.toHaveBeenCalled();
  });

  it('treats a concurrent P2002 insert race as a duplicate', async () => {
    const { service } = makeService();
    const { raw, sig } = signedBody(capturedEvent());
    const { Prisma } = await import('@jobportal/db');
    db.paymentWebhookEvent.create.mockRejectedValue(
      new (Prisma as unknown as { PrismaClientKnownRequestError: new (c: string) => Error })
        .PrismaClientKnownRequestError('P2002'),
    );
    await expect(service.handleWebhook(raw, sig, 'evt_1')).resolves.toEqual({
      status: 'duplicate',
    });
  });

  it('payment.captured activates the matching order and marks the event processed', async () => {
    const { service } = makeService();
    const activateSpy = vi
      .spyOn(
        service as unknown as {
          activatePaidOrder: (id: number, p: string) => Promise<unknown>;
        },
        'activatePaidOrder',
      )
      .mockResolvedValue({ alreadyProcessed: false });
    db.paymentOrder.findUnique.mockResolvedValue({ id: 501 });
    const { raw, sig } = signedBody(capturedEvent());

    await expect(service.handleWebhook(raw, sig, 'evt_1')).resolves.toEqual({
      status: 'processed',
    });
    expect(activateSpy).toHaveBeenCalledWith(501, 'pay_Y1');
    expect(db.paymentWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: 'evt_1' },
        data: expect.objectContaining({ processedAt: expect.any(Date) }),
      }),
    );
  });

  it('order.paid resolves the order id from the order entity', async () => {
    const { service } = makeService();
    const activateSpy = vi
      .spyOn(
        service as unknown as {
          activatePaidOrder: (id: number, p: string) => Promise<unknown>;
        },
        'activatePaidOrder',
      )
      .mockResolvedValue({ alreadyProcessed: true });
    db.paymentOrder.findUnique.mockResolvedValue({ id: 501 });
    const { raw, sig } = signedBody({
      event: 'order.paid',
      payload: {
        order: { entity: { id: 'order_X1' } },
        payment: { entity: { id: 'pay_Y1', order_id: 'order_X1' } },
      },
    });
    await service.handleWebhook(raw, sig, 'evt_2');
    expect(activateSpy).toHaveBeenCalledWith(501, 'pay_Y1');
  });

  it('an unknown order id is recorded and ignored (not ours)', async () => {
    const { service } = makeService();
    db.paymentOrder.findUnique.mockResolvedValue(null);
    const { raw, sig } = signedBody(capturedEvent('order_SOMEONE_ELSE'));
    await expect(service.handleWebhook(raw, sig, 'evt_3')).resolves.toEqual({
      status: 'processed',
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('payment.failed marks a CREATED order FAILED with an audit row', async () => {
    const { service } = makeService();
    db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prisma),
    );
    db.paymentOrder.findUnique.mockResolvedValue(makeOrder());
    const { raw, sig } = signedBody({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: { id: 'pay_Y1', order_id: 'order_X1', error_description: 'Card declined' },
        },
      },
    });
    await service.handleWebhook(raw, sig, 'evt_4');
    expect(db.paymentOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED', failureReason: 'Card declined' }),
      }),
    );
    const audit = db.profileAuditLog.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(audit['action']).toBe('BILLING_PAYMENT_FAILED');
  });

  it('a late payment.failed never clobbers a PAID order', async () => {
    const { service } = makeService();
    db.paymentOrder.findUnique.mockResolvedValue(makeOrder({ status: 'PAID' }));
    const { raw, sig } = signedBody({
      event: 'payment.failed',
      payload: { payment: { entity: { id: 'pay_Y1', order_id: 'order_X1' } } },
    });
    await service.handleWebhook(raw, sig, 'evt_5');
    expect(db.paymentOrder.update).not.toHaveBeenCalled();
  });

  it('derives a deterministic event id when the header is missing', async () => {
    const { service } = makeService();
    db.paymentOrder.findUnique.mockResolvedValue(null);
    const { raw, sig } = signedBody(capturedEvent());
    await service.handleWebhook(raw, sig, undefined);
    const created = db.paymentWebhookEvent.create.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(String(created['eventId'])).toMatch(/^derived_[0-9a-f]{40}$/);
  });
});

// --- Billing profile + invoice download ----------------------------------------------

describe('upsertBillingProfile', () => {
  it('upserts and audits the diff', async () => {
    const { service } = makeService();
    db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prisma),
    );
    db.companyBillingProfile.findUnique.mockResolvedValue(null);
    db.companyBillingProfile.upsert.mockResolvedValue(PROFILE);
    const result = await service.upsertBillingProfile(1, {
      legalName: PROFILE.legalName,
      gstin: PROFILE.gstin,
      addressLine1: PROFILE.addressLine1,
      city: PROFILE.city,
      state: 'Maharashtra',
      pincode: PROFILE.pincode,
    });
    expect(result.legalName).toBe(PROFILE.legalName);
    const audit = db.profileAuditLog.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(audit['action']).toBe('BILLING_PROFILE_UPDATE');
  });

  it('writes no audit row when nothing changed', async () => {
    const { service } = makeService();
    db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prisma),
    );
    db.companyBillingProfile.findUnique.mockResolvedValue(PROFILE);
    db.companyBillingProfile.upsert.mockResolvedValue(PROFILE);
    await service.upsertBillingProfile(1, {
      legalName: PROFILE.legalName,
      gstin: PROFILE.gstin,
      addressLine1: PROFILE.addressLine1,
      city: PROFILE.city,
      state: 'Maharashtra',
      pincode: PROFILE.pincode,
    });
    expect(db.profileAuditLog.create).not.toHaveBeenCalled();
  });

  it('rejects MEMBERs', async () => {
    const { service } = makeService();
    db.recruiter.findUnique.mockResolvedValue(MEMBER);
    await expect(
      service.upsertBillingProfile(1, {
        legalName: 'X Co',
        addressLine1: 'Street 1',
        city: 'Pune',
        state: 'Maharashtra',
        pincode: '411045',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('getInvoicePdf', () => {
  it('404s a cross-company invoice', async () => {
    const { service } = makeService();
    db.subscriptionInvoice.findUnique.mockResolvedValue({
      id: 99,
      companyId: 999,
      pdfKey: 'k',
      invoiceNumber: 'INV-2627-000001',
    });
    await expect(service.getInvoicePdf(1, 99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('streams the stored PDF with the invoice-number filename', async () => {
    const { service, storage } = makeService();
    db.subscriptionInvoice.findUnique.mockResolvedValue({
      id: 99,
      companyId: 7,
      pdfKey: 'invoices/7/INV-2627-000001.pdf',
      invoiceNumber: 'INV-2627-000001',
    });
    const result = await service.getInvoicePdf(1, 99);
    expect(result.filename).toBe('INV-2627-000001.pdf');
    expect(storage.getObject).toHaveBeenCalledWith('invoices/7/INV-2627-000001.pdf');
  });

  it('self-heals a missing PDF by regenerating (no receipt re-email)', async () => {
    const { service, storage, artifactsSpy } = makeService();
    db.subscriptionInvoice.findUnique.mockResolvedValue({
      id: 99,
      companyId: 7,
      pdfKey: null,
      invoiceNumber: 'INV-2627-000001',
    });
    storage.getObject.mockResolvedValueOnce({
      body: Buffer.from('%PDF-'),
      contentType: 'application/pdf',
    });
    await service.getInvoicePdf(1, 99);
    expect(artifactsSpy).toHaveBeenCalledWith(99, false);
  });
});
