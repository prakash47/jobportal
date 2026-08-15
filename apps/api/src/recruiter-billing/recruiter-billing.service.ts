import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { FLAG, isFlagEnabled } from '@jobportal/feature-flags';
import { prisma, Prisma } from '@jobportal/db';
import type { CompanyBillingProfile, RecruiterRole } from '@jobportal/db';
import { EmailService } from '../email/email.service';
import { StorageService } from '../storage/storage.service';
import { addDays } from '../common/billing-period';
import { buildDiff, isDiffEmpty } from '../profile/audit';
import { computeGstBreakup, formatInrFromPaise } from './gst';
import { allocateInvoiceNumber } from './invoice-number';
import { renderInvoicePdf, type InvoicePdfData } from './invoice-pdf';
import { RazorpayClient } from './razorpay.client';
import type { BillingProfileInput, CreateOrderInput, VerifyPaymentInput } from './dto';

// Recruiter Plans & Billing (SRS §4.11 / §7). PAID-FEATURE gate (Pattern B,
// positive): the whole surface is hidden while subscription.system.enabled is
// OFF — L1 recruiter middleware 404s /plans + /billing, L2 pages notFound(),
// and this service (the only trusted layer) throws 403 on every entry point.
// This is deliberately NOT the killswitch 503 idiom — seeded OFF means the
// Day-0 freemium state, per CLAUDE.md §0/§4.

const SELLER_STATE_DEFAULT = 'Maharashtra';
// SAC 998519 — "Other employment & labour supply services". Placeholder the
// owner's CA should confirm before live billing; overridable via env.
const SAC_DEFAULT = '998519';

interface BillingCaller {
  id: number;
  companyId: number;
  companyRole: RecruiterRole;
  name: string;
  email: string;
  companyName: string;
}

export interface CreateOrderResult {
  paymentOrderId: number;
  razorpayOrderId: string;
  keyId: string;
  amountInPaise: number;
  currency: string;
  planName: string;
  isStub: boolean;
  prefill: { name: string; email: string };
}

interface ActivationResult {
  alreadyProcessed: boolean;
  paymentOrderId: number;
  subscriptionId: number | null;
  invoiceId: number | null;
}

// Minimal shape of the Razorpay webhook body — accessed defensively with
// optional chaining; anything missing degrades to "log and ignore".
interface RazorpayWebhookBody {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        error_code?: string | null;
        error_description?: string | null;
      };
    };
    order?: { entity?: { id?: string } };
  };
}

function sellerState(): string {
  return (process.env.BILLING_SELLER_STATE ?? '').trim() || SELLER_STATE_DEFAULT;
}

@Injectable()
export class RecruiterBillingService {
  private readonly logger = new Logger(RecruiterBillingService.name);

  constructor(
    private readonly razorpay: RazorpayClient,
    private readonly storage: StorageService,
    private readonly email: EmailService,
  ) {}

  // --- Gates ----------------------------------------------------------------

  private async assertBillingEnabled(): Promise<void> {
    if (!(await isFlagEnabled(FLAG.SUBSCRIPTION_SYSTEM))) {
      throw new ForbiddenException('Billing is not available yet');
    }
  }

  private async getCaller(userId: number): Promise<BillingCaller> {
    const rec = await prisma.recruiter.findUnique({
      where: { userId },
      select: {
        id: true,
        companyId: true,
        companyRole: true,
        deactivatedAt: true,
        user: { select: { name: true, email: true } },
        company: { select: { name: true } },
      },
    });
    if (!rec) throw new NotFoundException('Recruiter profile not found');
    if (rec.deactivatedAt) throw new ForbiddenException('Your account has been deactivated');
    return {
      id: rec.id,
      companyId: rec.companyId,
      companyRole: rec.companyRole,
      name: rec.user.name,
      email: rec.user.email,
      companyName: rec.company.name,
    };
  }

  // Billing money-moves are OWNER/ADMIN territory; MEMBERs get a read-only
  // /billing view rendered by the RSC (which does its own role check for UI).
  private assertCanManageBilling(role: RecruiterRole): void {
    if (role !== 'OWNER' && role !== 'ADMIN') {
      throw new ForbiddenException('Only owners and admins can manage billing');
    }
  }

  // --- Billing profile --------------------------------------------------------

  async upsertBillingProfile(userId: number, input: BillingProfileInput) {
    await this.assertBillingEnabled();
    const caller = await this.getCaller(userId);
    this.assertCanManageBilling(caller.companyRole);

    const data = {
      legalName: input.legalName,
      gstin: input.gstin ? input.gstin : null,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2 ? input.addressLine2 : null,
      city: input.city,
      state: input.state,
      pincode: input.pincode,
      billingEmail: input.billingEmail ? input.billingEmail : null,
    };

    const before = await prisma.companyBillingProfile.findUnique({
      where: { companyId: caller.companyId },
    });

    const saved = await prisma.$transaction(async (tx) => {
      const profile = await tx.companyBillingProfile.upsert({
        where: { companyId: caller.companyId },
        update: data,
        create: { companyId: caller.companyId, ...data },
      });
      const diff = buildDiff(profileDiffShape(before), profileDiffShape(profile));
      if (!isDiffEmpty(diff)) {
        await tx.profileAuditLog.create({
          data: {
            userId,
            action: 'BILLING_PROFILE_UPDATE',
            diff: diff as unknown as Prisma.InputJsonValue,
          },
        });
      }
      return profile;
    });

    return publicProfile(saved);
  }

  // --- Order creation + checkout verification --------------------------------

  async createOrder(userId: number, input: CreateOrderInput): Promise<CreateOrderResult> {
    await this.assertBillingEnabled();
    const caller = await this.getCaller(userId);
    this.assertCanManageBilling(caller.companyRole);

    // Server-authoritative price: the plan row is the only amount source.
    const plan = await prisma.subscriptionPlan.findFirst({
      where: { id: input.planId, audience: 'RECRUITER', isActive: true, isPublic: true },
    });
    if (!plan) throw new NotFoundException('Plan not found');
    if (plan.tier === 'FREE' || plan.priceInPaise <= 0) {
      throw new BadRequestException('This plan cannot be purchased');
    }
    // Per-tier launch flag (subscription.plans.basic/premium/enterprise.enabled,
    // seeded OFF) — lets the admin launch tiers one at a time.
    const tierFlag = `subscription.plans.${plan.tier.toLowerCase()}.enabled`;
    if (!(await isFlagEnabled(tierFlag))) {
      throw new ForbiddenException('This plan is not available for purchase yet');
    }

    // A billing profile must exist before money moves — the invoice needs the
    // buyer's legal identity + state at capture time.
    const profile = await prisma.companyBillingProfile.findUnique({
      where: { companyId: caller.companyId },
      select: { id: true },
    });
    if (!profile) {
      throw new ConflictException('Add your billing details before purchasing a plan');
    }

    const gateway = await this.razorpay.createOrder(
      plan.priceInPaise,
      plan.currency,
      // Razorpay receipt ≤ 40 chars; unique enough for reconciliation.
      `co${caller.companyId}-${Date.now()}`,
    );

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.paymentOrder.create({
        data: {
          companyId: caller.companyId,
          createdByUserId: userId,
          planId: plan.id,
          amountInPaise: plan.priceInPaise,
          currency: plan.currency,
          razorpayOrderId: gateway.orderId,
        },
      });
      await tx.profileAuditLog.create({
        data: {
          userId,
          action: 'BILLING_ORDER_CREATED',
          diff: {
            paymentOrderId: created.id,
            planSlug: plan.slug,
            amountInPaise: plan.priceInPaise,
            razorpayOrderId: gateway.orderId,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      return created;
    });

    return {
      paymentOrderId: order.id,
      razorpayOrderId: order.razorpayOrderId,
      keyId: this.razorpay.keyId(),
      amountInPaise: order.amountInPaise,
      currency: order.currency,
      planName: plan.name,
      isStub: this.razorpay.isStub(),
      prefill: { name: caller.name, email: caller.email },
    };
  }

  // Browser Checkout success callback. Faster than the webhook but never the
  // only path — activation is idempotent, whichever arrives first wins.
  async verifyCheckout(userId: number, paymentOrderId: number, input: VerifyPaymentInput) {
    await this.assertBillingEnabled();
    const caller = await this.getCaller(userId);
    this.assertCanManageBilling(caller.companyRole);

    const order = await prisma.paymentOrder.findUnique({ where: { id: paymentOrderId } });
    // Cross-company (or missing) → 404, indistinguishable, no probing.
    if (!order || order.companyId !== caller.companyId) {
      throw new NotFoundException('Order not found');
    }
    if (order.status === 'PAID') {
      const invoice = await prisma.subscriptionInvoice.findUnique({
        where: { paymentOrderId: order.id },
        select: { id: true },
      });
      return { status: 'active' as const, invoiceId: invoice?.id ?? null };
    }
    if (input.razorpayOrderId !== order.razorpayOrderId) {
      throw new BadRequestException('Order mismatch');
    }
    if (
      !this.razorpay.verifyCheckoutSignature(
        order.razorpayOrderId,
        input.razorpayPaymentId,
        input.razorpaySignature,
      )
    ) {
      throw new BadRequestException('Payment signature verification failed');
    }

    const result = await this.activatePaidOrder(order.id, input.razorpayPaymentId);
    return { status: 'active' as const, invoiceId: result.invoiceId };
  }

  // Dev-only: completes an order without a gateway. Hard-disabled the moment
  // real keys exist (or in production) — 404 so the route "does not exist".
  async simulatePayment(userId: number, paymentOrderId: number) {
    if (!this.razorpay.isStub() || process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
    await this.assertBillingEnabled();
    const caller = await this.getCaller(userId);
    this.assertCanManageBilling(caller.companyRole);

    const order = await prisma.paymentOrder.findUnique({ where: { id: paymentOrderId } });
    if (!order || order.companyId !== caller.companyId) {
      throw new NotFoundException('Order not found');
    }
    const result = await this.activatePaidOrder(
      order.id,
      `pay_stub_${randomBytes(8).toString('hex')}`,
    );
    return { status: 'active' as const, invoiceId: result.invoiceId };
  }

  // --- Webhook (source of truth) ---------------------------------------------

  // Signature-verified + idempotent per CLAUDE.md §3.2. Dedupe rides the
  // PaymentWebhookEvent unique eventId; a row without processedAt is a prior
  // FAILED attempt and is reprocessed (Razorpay retries non-2xx deliveries).
  async handleWebhook(
    rawBody: Buffer,
    signature: string | undefined,
    eventIdHeader: string | undefined,
  ) {
    if (!signature || !this.razorpay.verifyWebhookSignature(rawBody, signature)) {
      throw new BadRequestException('Invalid webhook signature');
    }

    let body: RazorpayWebhookBody;
    try {
      body = JSON.parse(rawBody.toString('utf8')) as RazorpayWebhookBody;
    } catch {
      throw new BadRequestException('Invalid webhook payload');
    }
    const eventType = typeof body.event === 'string' ? body.event : 'unknown';
    const eventId =
      eventIdHeader?.trim() ||
      // Deterministic fallback (same raw body ⇒ same id) if the header is absent.
      `derived_${createHash('sha256').update(rawBody).digest('hex').slice(0, 40)}`;

    const existing = await prisma.paymentWebhookEvent.findUnique({ where: { eventId } });
    if (existing?.processedAt) return { status: 'duplicate' as const };
    if (!existing) {
      try {
        await prisma.paymentWebhookEvent.create({
          data: { eventId, eventType, payload: body as unknown as Prisma.InputJsonValue },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          // Concurrent duplicate delivery won the insert — let it do the work.
          return { status: 'duplicate' as const };
        }
        throw err;
      }
    }

    // Any throw below leaves processedAt null → Razorpay's retry reprocesses.
    switch (eventType) {
      case 'payment.captured':
      case 'order.paid': {
        const orderId =
          eventType === 'order.paid'
            ? body.payload?.order?.entity?.id
            : body.payload?.payment?.entity?.order_id;
        const paymentId = body.payload?.payment?.entity?.id ?? null;
        if (!orderId) {
          this.logger.warn(`webhook ${eventType} without an order id — ignored`);
          break;
        }
        const order = await prisma.paymentOrder.findUnique({
          where: { razorpayOrderId: orderId },
          select: { id: true },
        });
        if (!order) {
          // Not one of ours (e.g. a future candidate-side order) — record + move on.
          this.logger.log(`webhook ${eventType} for unknown order ${orderId} — ignored`);
          break;
        }
        await this.activatePaidOrder(order.id, paymentId);
        break;
      }
      case 'payment.failed': {
        const entity = body.payload?.payment?.entity;
        const orderId = entity?.order_id;
        if (!orderId) break;
        const order = await prisma.paymentOrder.findUnique({
          where: { razorpayOrderId: orderId },
        });
        // Cheap skip for the common late-after-capture case.
        if (!order || order.status !== 'CREATED') break;
        // Only a not-yet-paid order can fail. The transition is CONDITIONAL on
        // status=CREATED inside the write (updateMany), so a capture that
        // commits PAID concurrently — between this read and the write — is not
        // clobbered (count === 0 ⇒ the order is already PAID/FAILED, skip).
        const reason = entity?.error_description ?? entity?.error_code ?? 'Payment failed';
        await prisma.$transaction(async (tx) => {
          const updated = await tx.paymentOrder.updateMany({
            where: { id: order.id, status: 'CREATED' },
            data: { status: 'FAILED', failureReason: reason },
          });
          if (updated.count === 0) return; // already captured or failed — no audit
          await tx.profileAuditLog.create({
            data: {
              userId: order.createdByUserId,
              action: 'BILLING_PAYMENT_FAILED',
              diff: {
                paymentOrderId: order.id,
                razorpayOrderId: orderId,
                reason,
              } as unknown as Prisma.InputJsonValue,
            },
          });
        });
        break;
      }
      default:
        this.logger.log(`webhook event ${eventType} — no handler, recorded only`);
    }

    await prisma.paymentWebhookEvent.update({
      where: { eventId },
      data: { processedAt: new Date() },
    });
    return { status: 'processed' as const };
  }

  // --- Invoice download --------------------------------------------------------

  // Streams the PDF bytes through the API (guards + role check apply on every
  // download) instead of minting a signed URL — uniform across the in-memory
  // dev backend and R2, and never produces a shareable link. Invoice PDFs are
  // small; proxy bandwidth is negligible.
  async getInvoicePdf(
    userId: number,
    invoiceId: number,
  ): Promise<{ pdf: Buffer; filename: string }> {
    await this.assertBillingEnabled();
    const caller = await this.getCaller(userId);
    this.assertCanManageBilling(caller.companyRole);

    const invoice = await prisma.subscriptionInvoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, companyId: true, pdfKey: true, invoiceNumber: true },
    });
    if (!invoice || invoice.companyId !== caller.companyId) {
      throw new NotFoundException('Invoice not found');
    }
    // Self-heal: if PDF generation failed (or the in-memory dev store was lost
    // on an API restart), regenerate on demand.
    let key = invoice.pdfKey;
    let obj = key ? await this.storage.getObject(key) : null;
    if (!obj) {
      key = await this.issueInvoiceArtifacts(invoice.id, false);
      obj = await this.storage.getObject(key);
    }
    if (!obj) throw new NotFoundException('Invoice PDF is unavailable');
    return { pdf: obj.body, filename: `${invoice.invoiceNumber ?? `invoice-${invoice.id}`}.pdf` };
  }

  // --- Activation core (idempotent) ---------------------------------------------

  // Both capture paths (webhook + browser verify) land here. Idempotent and
  // serialized on two axes: a FOR UPDATE lock on THIS order (the re-read makes
  // a duplicate capture of the same order a no-op) AND a per-COMPANY advisory
  // lock taken before the subscription read/write, so two different orders of
  // the same company can't both read the same stale subscription and race the
  // extend/upgrade decision (double-charge → single period, or two ACTIVE subs).
  // razorpayPaymentId is null only when a webhook omits the payment entity id.
  private async activatePaidOrder(
    paymentOrderId: number,
    razorpayPaymentId: string | null,
  ): Promise<ActivationResult> {
    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PaymentOrder" WHERE id = ${paymentOrderId} FOR UPDATE`;
      const order = await tx.paymentOrder.findUnique({
        where: { id: paymentOrderId },
        include: { plan: true },
      });
      if (!order) throw new NotFoundException('Order not found');
      if (order.status === 'PAID') {
        const invoice = await tx.subscriptionInvoice.findUnique({
          where: { paymentOrderId },
          select: { id: true },
        });
        return {
          alreadyProcessed: true,
          paymentOrderId,
          subscriptionId: null,
          invoiceId: invoice?.id ?? null,
        };
      }

      // Serialize all activations for this company (see method comment). Held
      // until the transaction ends; consistent lock order (order row → company)
      // avoids deadlocks.
      //
      // ⚠ $executeRaw, NOT $queryRaw. pg_advisory_xact_lock() returns `void`,
      // and Prisma cannot deserialize a void column — $queryRaw throws "Failed
      // to deserialize column of type 'void'" and takes the whole capture down
      // with it. This line used $queryRaw from the day it was written and had
      // never run: PaymentOrder has zero rows, the gateway is unprovisioned, and
      // every test mocks Prisma, so the first REAL Razorpay capture would have
      // been the first execution — and it would have failed after the customer
      // was charged. Found when the admin console copied this line verbatim and
      // its own first live grant 500'd; verified by running both forms against
      // the dev database ($queryRaw fails, $executeRaw succeeds).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`billing:company:${order.companyId}`}))`;

      await tx.paymentOrder.update({
        where: { id: paymentOrderId },
        data: { status: 'PAID', razorpayPaymentId, paidAt: now, failureReason: null },
      });

      // Current company subscription (recruiter storefront only): same plan →
      // renewal extends the period; different plan → old one is cancelled
      // ('upgraded') and the new one starts now at full price (no proration —
      // owner-approved MVP rule).
      const existing = await tx.subscription.findFirst({
        where: {
          companyId: order.companyId,
          status: { in: ['ACTIVE', 'TRIALING'] },
          currentPeriodEnd: { gt: now },
          plan: { audience: 'RECRUITER' },
        },
        orderBy: { currentPeriodEnd: 'desc' },
        select: { id: true, planId: true, currentPeriodStart: true, currentPeriodEnd: true },
      });

      let subscriptionId: number;
      let periodEnd: Date;
      // The service window THIS payment paid for — frozen on the invoice so the
      // statutory document never drifts. A renewal bills the extension window
      // (old end → new end), not the whole subscription span.
      let invoicePeriodStart: Date;
      let invoicePeriodEnd: Date;
      if (existing && existing.planId === order.planId) {
        periodEnd = addDays(existing.currentPeriodEnd, order.plan.intervalDays);
        invoicePeriodStart = existing.currentPeriodEnd;
        invoicePeriodEnd = periodEnd;
        await tx.subscription.update({
          where: { id: existing.id },
          data: { status: 'ACTIVE', currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false },
        });
        subscriptionId = existing.id;
      } else {
        if (existing) {
          await tx.subscription.update({
            where: { id: existing.id },
            data: { status: 'CANCELLED', cancelledAt: now, cancelReason: 'upgraded' },
          });
        }
        periodEnd = addDays(now, order.plan.intervalDays);
        invoicePeriodStart = now;
        invoicePeriodEnd = periodEnd;
        const created = await tx.subscription.create({
          data: {
            userId: order.createdByUserId,
            companyId: order.companyId,
            planId: order.planId,
            status: 'ACTIVE',
            startedAt: now,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
          select: { id: true },
        });
        subscriptionId = created.id;
      }

      const profile = await tx.companyBillingProfile.findUnique({
        where: { companyId: order.companyId },
      });
      const buyerState = profile?.state ?? sellerState();
      const breakup = computeGstBreakup(order.amountInPaise, sellerState(), buyerState);
      const invoiceNumber = await allocateInvoiceNumber(tx, now);
      const invoice = await tx.subscriptionInvoice.create({
        data: {
          subscriptionId,
          companyId: order.companyId,
          paymentOrderId: order.id,
          invoiceNumber,
          amountInPaise: order.amountInPaise,
          taxableInPaise: breakup.taxableInPaise,
          cgstInPaise: breakup.cgstInPaise,
          sgstInPaise: breakup.sgstInPaise,
          igstInPaise: breakup.igstInPaise,
          gstRateBps: breakup.gstRateBps,
          placeOfSupply: buyerState,
          buyerSnapshot: profile
            ? (buyerSnapshotOf(profile) as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
          // Line-item facts frozen at issuance (see schema) — renders never drift.
          planNameSnapshot: order.plan.name,
          periodStart: invoicePeriodStart,
          periodEnd: invoicePeriodEnd,
          currency: order.currency,
          status: 'PAID',
          providerInvoiceId: razorpayPaymentId,
          paidAt: now,
        },
        select: { id: true },
      });

      await tx.profileAuditLog.create({
        data: {
          userId: order.createdByUserId,
          action: 'BILLING_SUBSCRIPTION_ACTIVATED',
          diff: {
            paymentOrderId: order.id,
            planSlug: order.plan.slug,
            amountInPaise: order.amountInPaise,
            subscriptionId,
            invoiceId: invoice.id,
            invoiceNumber,
            currentPeriodEnd: periodEnd.toISOString(),
          } as unknown as Prisma.InputJsonValue,
        },
      });

      return {
        alreadyProcessed: false,
        paymentOrderId,
        subscriptionId,
        invoiceId: invoice.id,
      };
    });

    // Post-commit side effects (PDF render/upload + receipt email) are
    // fire-and-log: a Resend/R2 blip must never fail the capture, and the
    // invoice download endpoint self-heals a missing PDF.
    if (!result.alreadyProcessed && result.invoiceId !== null) {
      const invoiceId = result.invoiceId;
      this.issueInvoiceArtifacts(invoiceId, true).catch((err: Error) => {
        this.logger.warn(`invoice artifacts failed for invoice ${invoiceId}: ${err.message}`);
      });
    }
    return result;
  }

  // Renders + stores the invoice PDF; optionally sends the receipt email
  // (only on first issuance — the download self-heal path passes false).
  private async issueInvoiceArtifacts(invoiceId: number, sendEmail: boolean): Promise<string> {
    const invoice = await prisma.subscriptionInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        subscription: { include: { plan: { select: { name: true } } } },
        paymentOrder: {
          include: { createdBy: { select: { id: true, email: true } } },
        },
        company: { select: { id: true, name: true } },
      },
    });
    if (!invoice || !invoice.invoiceNumber || invoice.companyId === null) {
      throw new Error(`invoice ${invoiceId} is not renderable (missing number or company)`);
    }

    const snapshot = (invoice.buyerSnapshot ?? null) as {
      legalName?: string;
      gstin?: string | null;
      addressLine1?: string;
      addressLine2?: string | null;
      city?: string;
      state?: string;
      pincode?: string;
    } | null;

    const data: InvoicePdfData = {
      invoiceNumber: invoice.invoiceNumber,
      issuedAt: invoice.createdAt,
      seller: {
        name: (process.env.BILLING_SELLER_NAME ?? '').trim() || 'Career Queue',
        address: (process.env.BILLING_SELLER_ADDRESS ?? '').trim() || '—',
        gstin: (process.env.BILLING_SELLER_GSTIN ?? '').trim(),
        state: sellerState(),
        sacCode: (process.env.BILLING_SAC_CODE ?? '').trim() || SAC_DEFAULT,
      },
      buyer: {
        legalName: snapshot?.legalName ?? invoice.company?.name ?? '—',
        addressLine1: snapshot?.addressLine1 ?? '—',
        addressLine2: snapshot?.addressLine2 ?? null,
        city: snapshot?.city ?? '—',
        state: snapshot?.state ?? invoice.placeOfSupply ?? '—',
        pincode: snapshot?.pincode ?? '',
        gstin: snapshot?.gstin ?? null,
      },
      // Render from the frozen snapshot, NOT the live subscription rows, so a
      // later renewal (which extends currentPeriodEnd) or plan rename can never
      // change an already-issued invoice. Live values are a defensive fallback
      // for any pre-snapshot legacy row (there are none in practice).
      planName: invoice.planNameSnapshot ?? invoice.subscription.plan.name,
      periodStart: invoice.periodStart ?? invoice.subscription.currentPeriodStart,
      periodEnd: invoice.periodEnd ?? invoice.subscription.currentPeriodEnd,
      taxableInPaise: invoice.taxableInPaise ?? invoice.amountInPaise,
      cgstInPaise: invoice.cgstInPaise ?? 0,
      sgstInPaise: invoice.sgstInPaise ?? 0,
      igstInPaise: invoice.igstInPaise ?? 0,
      gstRateBps: invoice.gstRateBps ?? 0,
      totalInPaise: invoice.amountInPaise,
    };

    const pdf = await renderInvoicePdf(data);
    const key = `invoices/${invoice.companyId}/${invoice.invoiceNumber}.pdf`;
    await this.storage.putObject(key, pdf, 'application/pdf');
    await prisma.subscriptionInvoice.update({
      where: { id: invoiceId },
      data: { pdfKey: key },
    });

    if (sendEmail && invoice.paymentOrder) {
      const profile = await prisma.companyBillingProfile.findUnique({
        where: { companyId: invoice.companyId },
        select: { billingEmail: true },
      });
      const to = profile?.billingEmail ?? invoice.paymentOrder.createdBy.email;
      const recruiterUrl = process.env.RECRUITER_URL ?? 'http://localhost:3001';
      this.email
        .enqueuePaymentReceipt(to, invoice.paymentOrder.createdBy.id, {
          invoiceNumber: invoice.invoiceNumber,
          amountInr: formatInrFromPaise(invoice.amountInPaise, ''),
          invoiceUrl: `${recruiterUrl}/billing`,
          planName: invoice.subscription.plan.name,
        })
        .catch((err: Error) => {
          this.logger.warn(`payment receipt email enqueue failed: ${err.message}`);
        });
    }

    return key;
  }
}

// Normalized shape for audit diffs (stable key order, no timestamps/ids).
function profileDiffShape(p: CompanyBillingProfile | null): Record<string, unknown> {
  return {
    legalName: p?.legalName ?? null,
    gstin: p?.gstin ?? null,
    addressLine1: p?.addressLine1 ?? null,
    addressLine2: p?.addressLine2 ?? null,
    city: p?.city ?? null,
    state: p?.state ?? null,
    pincode: p?.pincode ?? null,
    billingEmail: p?.billingEmail ?? null,
  };
}

function buyerSnapshotOf(p: CompanyBillingProfile): Record<string, unknown> {
  return {
    legalName: p.legalName,
    gstin: p.gstin,
    addressLine1: p.addressLine1,
    addressLine2: p.addressLine2,
    city: p.city,
    state: p.state,
    pincode: p.pincode,
  };
}

function publicProfile(p: CompanyBillingProfile) {
  return {
    legalName: p.legalName,
    gstin: p.gstin,
    addressLine1: p.addressLine1,
    addressLine2: p.addressLine2,
    city: p.city,
    state: p.state,
    pincode: p.pincode,
    billingEmail: p.billingEmail,
  };
}
