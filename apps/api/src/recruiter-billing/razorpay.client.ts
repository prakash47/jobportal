import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import Razorpay from 'razorpay';

// Thin gateway port around the official Razorpay SDK (Orders API only — the
// MVP sells prepaid fixed-duration plans, not auto-renewing Subscriptions,
// per the RBI e-mandate friction recorded in PROGRESS.md). Keeping every
// Razorpay touchpoint behind this class means a second gateway (Cashfree) is
// a drop-in later.
//
// Keyless stub mode (Resend/R2 convention): when RAZORPAY_KEY_ID is blank the
// client mints fake "order_stub_*" ids instead of calling the network, and the
// billing service exposes a dev-only "simulate payment" path so the whole
// purchase flow is demoable on a laptop with no Razorpay account. Real keys
// (test-mode rzp_test_* or live) switch all of this off.

export interface CreatedGatewayOrder {
  orderId: string;
  amountInPaise: number;
  currency: string;
}

@Injectable()
export class RazorpayClient {
  private readonly logger = new Logger(RazorpayClient.name);
  private sdk: Razorpay | null = null;

  isStub(): boolean {
    return !(process.env.RAZORPAY_KEY_ID ?? '').trim();
  }

  // The key id is public by design (it is embedded in the browser Checkout);
  // the recruiter app receives it in the create-order response rather than
  // via its own NEXT_PUBLIC_* env so there is exactly one source of truth.
  keyId(): string {
    return (process.env.RAZORPAY_KEY_ID ?? '').trim();
  }

  private instance(): Razorpay {
    if (this.isStub()) {
      // Callers gate on isStub() first; this is a programming-error backstop.
      throw new ServiceUnavailableException('Payment gateway is not configured');
    }
    if (!this.sdk) {
      this.sdk = new Razorpay({
        key_id: (process.env.RAZORPAY_KEY_ID ?? '').trim(),
        key_secret: (process.env.RAZORPAY_KEY_SECRET ?? '').trim(),
      });
    }
    return this.sdk;
  }

  async createOrder(
    amountInPaise: number,
    currency: string,
    receipt: string,
  ): Promise<CreatedGatewayOrder> {
    if (this.isStub()) {
      const orderId = `order_stub_${randomBytes(12).toString('hex')}`;
      this.logger.log(`(stub — Razorpay not configured) created ${orderId} for ${amountInPaise}p`);
      return { orderId, amountInPaise, currency };
    }
    const order = await this.instance().orders.create({
      amount: amountInPaise, // Razorpay amounts are integers in the smallest unit
      currency,
      receipt,
    });
    return {
      orderId: order.id,
      amountInPaise: Number(order.amount),
      currency: order.currency,
    };
  }

  // Browser Checkout handler verification: HMAC-SHA256("order_id|payment_id")
  // keyed with the API key secret. Stub orders are verified by the dev-only
  // simulate path instead — a stub can never pass here (no secret to sign with).
  verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
    const secret = (process.env.RAZORPAY_KEY_SECRET ?? '').trim();
    if (!secret) return false;
    const expected = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
    return safeEqualHex(expected, signature);
  }

  // Webhook verification: HMAC-SHA256 over the RAW request body keyed with the
  // webhook secret (a different secret from the key secret). Any re-serialized
  // JSON breaks the digest, hence rawBody:true in main.ts.
  verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
    const secret = (process.env.RAZORPAY_WEBHOOK_SECRET ?? '').trim();
    if (!secret) return false;
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    return safeEqualHex(expected, signature);
  }
}

// Constant-time comparison; length mismatch handled without throwing.
function safeEqualHex(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
