import { describe, expect, it } from 'vitest';
import { BillingProfileDto, CreateOrderDto, INDIAN_STATES, VerifyPaymentDto } from './dto';

describe('CreateOrderDto', () => {
  it('accepts a positive integer planId', () => {
    expect(CreateOrderDto.safeParse({ planId: 3 }).success).toBe(true);
  });

  it('rejects missing / non-integer / negative planId and unknown keys', () => {
    expect(CreateOrderDto.safeParse({}).success).toBe(false);
    expect(CreateOrderDto.safeParse({ planId: 1.5 }).success).toBe(false);
    expect(CreateOrderDto.safeParse({ planId: -1 }).success).toBe(false);
    expect(CreateOrderDto.safeParse({ planId: '3' }).success).toBe(false);
    expect(CreateOrderDto.safeParse({ planId: 3, amount: 1 }).success).toBe(false);
  });
});

describe('VerifyPaymentDto', () => {
  const valid = {
    razorpayOrderId: 'order_abc',
    razorpayPaymentId: 'pay_abc',
    razorpaySignature: 'a'.repeat(64),
  };

  it('accepts the checkout handler triple', () => {
    expect(VerifyPaymentDto.safeParse(valid).success).toBe(true);
  });

  it('rejects missing fields, empty strings, and unknown keys', () => {
    expect(VerifyPaymentDto.safeParse({ ...valid, razorpaySignature: '' }).success).toBe(false);
    expect(VerifyPaymentDto.safeParse({ ...valid, extra: true }).success).toBe(false);
    const { razorpayOrderId: _dropped, ...rest } = valid;
    expect(VerifyPaymentDto.safeParse(rest).success).toBe(false);
  });
});

describe('BillingProfileDto', () => {
  const valid = {
    legalName: 'Nimbus Cloud Systems Pvt Ltd',
    gstin: '27AAPFU0939F1ZV',
    addressLine1: '4th Floor, Tower B',
    addressLine2: 'Baner Road',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411045',
    billingEmail: 'Accounts@Nimbus.example',
  };

  it('accepts a full profile and normalizes gstin + email', () => {
    const parsed = BillingProfileDto.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.gstin).toBe('27AAPFU0939F1ZV');
      expect(parsed.data.billingEmail).toBe('accounts@nimbus.example');
    }
  });

  it('accepts the minimal B2C shape (no GSTIN, no email, no line 2)', () => {
    const parsed = BillingProfileDto.safeParse({
      legalName: 'Tiny Hirer',
      addressLine1: '12 MG Road',
      city: 'Indore',
      state: 'Madhya Pradesh',
      pincode: '452001',
    });
    expect(parsed.success).toBe(true);
  });

  it('normalizes a lowercase gstin before validating', () => {
    const parsed = BillingProfileDto.safeParse({ ...valid, gstin: '27aapfu0939f1zv' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.gstin).toBe('27AAPFU0939F1ZV');
  });

  it('accepts an empty gstin (clears it) but rejects a malformed one', () => {
    expect(BillingProfileDto.safeParse({ ...valid, gstin: '' }).success).toBe(true);
    expect(BillingProfileDto.safeParse({ ...valid, gstin: 'NOT-A-GSTIN' }).success).toBe(false);
    expect(BillingProfileDto.safeParse({ ...valid, gstin: '27AAPFU0939F1AV' }).success).toBe(false); // no Z
  });

  it('rejects a bad pincode, an unknown state, and unknown keys', () => {
    expect(BillingProfileDto.safeParse({ ...valid, pincode: '04110' }).success).toBe(false);
    expect(BillingProfileDto.safeParse({ ...valid, pincode: '011045' }).success).toBe(false);
    expect(BillingProfileDto.safeParse({ ...valid, state: 'Mumbai' }).success).toBe(false);
    expect(BillingProfileDto.safeParse({ ...valid, hacked: 1 }).success).toBe(false);
  });

  it('state list covers all 36 states + UTs (kept in lockstep with the recruiter app copy)', () => {
    expect(INDIAN_STATES).toHaveLength(36);
    expect(INDIAN_STATES).toContain('Maharashtra');
    expect(INDIAN_STATES).toContain('Delhi');
    expect(INDIAN_STATES).toContain('Puducherry');
  });
});
