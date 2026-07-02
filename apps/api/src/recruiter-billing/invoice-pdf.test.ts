import { describe, expect, it } from 'vitest';
import { renderInvoicePdf, type InvoicePdfData } from './invoice-pdf';

const base: InvoicePdfData = {
  invoiceNumber: 'INV-2627-000001',
  issuedAt: new Date('2026-07-02T10:00:00Z'),
  seller: {
    name: 'Career Queue',
    address: 'Mumbai, Maharashtra',
    gstin: '27ABCDE1234F1Z5',
    state: 'Maharashtra',
    sacCode: '998519',
  },
  buyer: {
    legalName: 'Nimbus Cloud Systems Pvt Ltd',
    addressLine1: '4th Floor, Tower B',
    addressLine2: null,
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411045',
    gstin: '27AAPFU0939F1ZV',
  },
  planName: 'Recruiter Starter',
  periodStart: new Date('2026-07-02T10:00:00Z'),
  periodEnd: new Date('2026-08-01T10:00:00Z'),
  taxableInPaise: 169407,
  cgstInPaise: 15246,
  sgstInPaise: 15247,
  igstInPaise: 0,
  gstRateBps: 1800,
  totalInPaise: 199900,
};

describe('renderInvoicePdf', () => {
  it('renders a non-trivial PDF buffer (intra-state, CGST+SGST)', async () => {
    const pdf = await renderInvoicePdf(base);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('renders the IGST + unregistered-buyer variant too', async () => {
    const pdf = await renderInvoicePdf({
      ...base,
      buyer: { ...base.buyer, gstin: null, state: 'Karnataka' },
      cgstInPaise: 0,
      sgstInPaise: 0,
      igstInPaise: 30493,
    });
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
