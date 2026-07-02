import { z } from 'zod';

// Recruiter Plans & Billing DTOs. Same conventions as the sibling recruiter
// modules: .strict() so unknown keys 400, normalization in the schema, and the
// service re-checks anything security-critical (the DTO is UX; the API is the
// trust boundary).

// GSTIN format check only (same regex as recruiter-kyc); live GSTN registry
// verification stays a Phase-2 follow-up.
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const gstinSchema = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .pipe(z.string().regex(GSTIN_RE, 'Invalid GSTIN — must be a 15-character GST number'));

// States + UTs — the billing profile's state drives the CGST+SGST vs IGST
// split, so it must be a canonical value, not free text. The recruiter app
// renders this same list in its <Select> (kept in lockstep by the dto test).
export const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
] as const;

export const CreateOrderDto = z
  .object({
    planId: z.number().int().positive(),
  })
  .strict();
export type CreateOrderInput = z.infer<typeof CreateOrderDto>;

// Field names mirror what Razorpay Checkout hands back to the browser handler.
export const VerifyPaymentDto = z
  .object({
    razorpayOrderId: z.string().min(1).max(120),
    razorpayPaymentId: z.string().min(1).max(120),
    razorpaySignature: z.string().min(1).max(256),
  })
  .strict();
export type VerifyPaymentInput = z.infer<typeof VerifyPaymentDto>;

export const BillingProfileDto = z
  .object({
    legalName: z.string().trim().min(2).max(200),
    // Optional: unregistered (B2C) buyers have no GSTIN. Empty string clears.
    gstin: z.union([gstinSchema, z.literal('')]).optional(),
    addressLine1: z.string().trim().min(3).max(200),
    addressLine2: z.union([z.string().trim().max(200), z.literal('')]).optional(),
    city: z.string().trim().min(2).max(100),
    state: z.enum(INDIAN_STATES),
    pincode: z
      .string()
      .trim()
      .regex(/^[1-9][0-9]{5}$/, 'Invalid PIN code — must be 6 digits'),
    billingEmail: z.union([z.string().trim().toLowerCase().email(), z.literal('')]).optional(),
  })
  .strict();
export type BillingProfileInput = z.infer<typeof BillingProfileDto>;
