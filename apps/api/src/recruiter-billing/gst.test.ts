import { describe, expect, it } from 'vitest';
import { amountInWords, computeGstBreakup, formatInrFromPaise } from './gst';
import { formatInvoiceNumber, fyCode } from './invoice-number';

describe('computeGstBreakup', () => {
  it('splits CGST+SGST for intra-state supply and sums back to the total', () => {
    const b = computeGstBreakup(199900, 'Maharashtra', 'Maharashtra');
    expect(b.igstInPaise).toBe(0);
    expect(b.cgstInPaise + b.sgstInPaise + b.taxableInPaise).toBe(199900);
    // 199900 / 1.18 ≈ 169407
    expect(b.taxableInPaise).toBe(169407);
    expect(b.gstRateBps).toBe(1800);
  });

  it('uses IGST for inter-state supply', () => {
    const b = computeGstBreakup(199900, 'Maharashtra', 'Karnataka');
    expect(b.cgstInPaise).toBe(0);
    expect(b.sgstInPaise).toBe(0);
    expect(b.igstInPaise + b.taxableInPaise).toBe(199900);
  });

  it('state comparison is case/whitespace insensitive', () => {
    const b = computeGstBreakup(100000, ' maharashtra ', 'MAHARASHTRA');
    expect(b.igstInPaise).toBe(0);
  });

  it('components always sum exactly to the charged total (odd amounts)', () => {
    for (const total of [1, 99, 117, 118, 119, 999999, 9999900]) {
      const intra = computeGstBreakup(total, 'Delhi', 'Delhi');
      expect(intra.taxableInPaise + intra.cgstInPaise + intra.sgstInPaise).toBe(total);
      const inter = computeGstBreakup(total, 'Delhi', 'Goa');
      expect(inter.taxableInPaise + inter.igstInPaise).toBe(total);
    }
  });

  it('rejects non-integer or negative totals', () => {
    expect(() => computeGstBreakup(10.5, 'Delhi', 'Goa')).toThrow();
    expect(() => computeGstBreakup(-1, 'Delhi', 'Goa')).toThrow();
  });
});

describe('formatInrFromPaise', () => {
  it('formats Indian digit grouping with two decimals', () => {
    expect(formatInrFromPaise(199900)).toBe('₹1,999.00');
    expect(formatInrFromPaise(9999900, 'INR ')).toBe('INR 99,999.00');
    expect(formatInrFromPaise(150, '')).toBe('1.50');
  });
});

describe('amountInWords', () => {
  it('renders Indian-system words', () => {
    expect(amountInWords(199900)).toBe('Rupees One Thousand Nine Hundred Ninety Nine Only');
    expect(amountInWords(9999900)).toBe('Rupees Ninety Nine Thousand Nine Hundred Ninety Nine Only');
    expect(amountInWords(10000000_00)).toBe('Rupees One Crore Only');
    expect(amountInWords(150)).toBe('Rupees One and Fifty Paise Only');
    expect(amountInWords(0)).toBe('Rupees Zero Only');
  });
});

describe('invoice numbering', () => {
  it('fyCode follows the Indian financial year (Apr–Mar)', () => {
    expect(fyCode(new Date('2026-07-02T00:00:00Z'))).toBe('2627');
    expect(fyCode(new Date('2026-03-31T00:00:00Z'))).toBe('2526');
    expect(fyCode(new Date('2026-04-01T12:00:00Z'))).toBe('2627');
    expect(fyCode(new Date('2027-01-15T00:00:00Z'))).toBe('2627');
  });

  it('formatInvoiceNumber zero-pads to a fixed, Rule-46-legal width', () => {
    expect(formatInvoiceNumber('2627', 1)).toBe('INV-2627-000001');
    expect(formatInvoiceNumber('2627', 123456)).toBe('INV-2627-123456');
    expect(formatInvoiceNumber('2627', 1).length).toBeLessThanOrEqual(16);
  });
});
