import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RazorpayClient } from './razorpay.client';

const ENV_KEYS = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('RazorpayClient stub mode', () => {
  it('isStub when RAZORPAY_KEY_ID is blank or whitespace', () => {
    const client = new RazorpayClient();
    expect(client.isStub()).toBe(true);
    process.env['RAZORPAY_KEY_ID'] = '   ';
    expect(client.isStub()).toBe(true);
    process.env['RAZORPAY_KEY_ID'] = 'rzp_test_abc';
    expect(client.isStub()).toBe(false);
  });

  it('createOrder mints an order_stub_* id without touching the network', async () => {
    const client = new RazorpayClient();
    const order = await client.createOrder(199900, 'INR', 'co1-123');
    expect(order.orderId).toMatch(/^order_stub_[0-9a-f]{24}$/);
    expect(order.amountInPaise).toBe(199900);
    expect(order.currency).toBe('INR');
  });
});

describe('checkout signature verification', () => {
  it('accepts the correct HMAC-SHA256(order|payment, key_secret)', () => {
    process.env['RAZORPAY_KEY_SECRET'] = 'secret-1';
    const client = new RazorpayClient();
    const sig = createHmac('sha256', 'secret-1').update('order_A|pay_B').digest('hex');
    expect(client.verifyCheckoutSignature('order_A', 'pay_B', sig)).toBe(true);
  });

  it('rejects a wrong signature, a swapped pair, and a missing secret', () => {
    process.env['RAZORPAY_KEY_SECRET'] = 'secret-1';
    const client = new RazorpayClient();
    const sig = createHmac('sha256', 'secret-1').update('order_A|pay_B').digest('hex');
    expect(client.verifyCheckoutSignature('order_A', 'pay_B', sig.slice(0, -2) + 'ff')).toBe(false);
    expect(client.verifyCheckoutSignature('pay_B', 'order_A', sig)).toBe(false);
    delete process.env['RAZORPAY_KEY_SECRET'];
    expect(client.verifyCheckoutSignature('order_A', 'pay_B', sig)).toBe(false);
  });
});

describe('webhook signature verification', () => {
  it('verifies the HMAC over the exact raw bytes', () => {
    process.env['RAZORPAY_WEBHOOK_SECRET'] = 'hook-secret';
    const client = new RazorpayClient();
    const raw = Buffer.from('{"event":"payment.captured","x":1}');
    const sig = createHmac('sha256', 'hook-secret').update(raw).digest('hex');
    expect(client.verifyWebhookSignature(raw, sig)).toBe(true);
    // Re-serialized JSON (different whitespace) must fail.
    expect(client.verifyWebhookSignature(Buffer.from('{"event":"payment.captured","x": 1}'), sig)).toBe(
      false,
    );
  });

  it('rejects when the webhook secret is unset or the signature length differs', () => {
    const client = new RazorpayClient();
    const raw = Buffer.from('{}');
    expect(client.verifyWebhookSignature(raw, 'deadbeef')).toBe(false);
    process.env['RAZORPAY_WEBHOOK_SECRET'] = 'hook-secret';
    expect(client.verifyWebhookSignature(raw, 'short')).toBe(false);
  });
});
