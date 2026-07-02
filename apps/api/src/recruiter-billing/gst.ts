// GST math for recruiter plan invoices. Plan prices are GST-INCLUSIVE (the
// sticker price is what the card is charged), so the invoice back-computes the
// taxable value from the grand total. Split rule (CGST Rule 46): intra-state
// supply (buyer state == seller state) → CGST + SGST halves; inter-state →
// IGST. Zero-rated export invoicing for foreign recruiters is a Phase-2
// follow-up (requires LUT + international activation) — every buyer today has
// an Indian billing state.

export const GST_RATE_BPS = 1800; // 18% — SaaS/IT services forward charge

export interface GstBreakup {
  taxableInPaise: number;
  cgstInPaise: number;
  sgstInPaise: number;
  igstInPaise: number;
  gstRateBps: number;
}

export function computeGstBreakup(
  totalInPaise: number,
  sellerState: string,
  buyerState: string,
): GstBreakup {
  if (!Number.isInteger(totalInPaise) || totalInPaise < 0) {
    throw new Error(`computeGstBreakup: invalid total ${totalInPaise}`);
  }
  // taxable = total / 1.18, rounded to the nearest paisa; GST is the remainder
  // so the three components always sum exactly back to the charged total.
  const taxableInPaise = Math.round((totalInPaise * 10_000) / (10_000 + GST_RATE_BPS));
  const gstInPaise = totalInPaise - taxableInPaise;

  const intraState = normalizeState(sellerState) === normalizeState(buyerState);
  if (intraState) {
    const cgstInPaise = Math.floor(gstInPaise / 2);
    return {
      taxableInPaise,
      cgstInPaise,
      sgstInPaise: gstInPaise - cgstInPaise,
      igstInPaise: 0,
      gstRateBps: GST_RATE_BPS,
    };
  }
  return {
    taxableInPaise,
    cgstInPaise: 0,
    sgstInPaise: 0,
    igstInPaise: gstInPaise,
    gstRateBps: GST_RATE_BPS,
  };
}

function normalizeState(s: string): string {
  return s.trim().toLowerCase();
}

// "₹1,999.00"-style display, except PDF-safe: the built-in Helvetica fonts in
// pdfkit have no U+20B9 rupee glyph, so callers that render into the PDF use
// the "INR " prefix variant instead.
export function formatInrFromPaise(paise: number, prefix: '₹' | 'INR ' | '' = '₹'): string {
  const rupees = paise / 100;
  return (
    prefix +
    rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

// Rule 46 wants the invoice total in words. Indian numbering (crore/lakh).
export function amountInWords(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const p = paise % 100;
  let words = `Rupees ${integerInWords(rupees)}`;
  if (p > 0) words += ` and ${integerInWords(p)} Paise`;
  return `${words} Only`;
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n] ?? '';
  const t = TENS[Math.floor(n / 10)] ?? '';
  const o = ONES[n % 10] ?? '';
  return o ? `${t} ${o}` : t;
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (rest) parts.push(belowHundred(rest));
  return parts.join(' ');
}

function integerInWords(n: number): string {
  if (n === 0) return 'Zero';
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1_000);
  const rest = n % 1_000;
  const parts: string[] = [];
  if (crore) parts.push(`${integerInWords(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(' ');
}
