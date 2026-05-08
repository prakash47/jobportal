import { esc, renderLayout, type Rendered } from './_layout';
import type { PaymentReceiptPayload } from './index';

// Phase 2 placeholder. Per CLAUDE.md §0 freemium ships first; the
// subscription + Stripe wiring lands later. This template exists so the
// transactional pipeline already knows the shape and we don't have to
// retrofit a queue variant when payments arrive.
export function renderPaymentReceipt(payload: PaymentReceiptPayload): Rendered {
  const subject = `Receipt — JobPortal ${payload.planName} (${payload.invoiceNumber})`;
  return renderLayout(subject, {
    preheader: `Receipt for your JobPortal ${payload.planName} subscription.`,
    heading: 'Thanks for your payment',
    bodyParagraphs: [
      `We've received your payment for the <strong>${esc(payload.planName)}</strong> plan.`,
      `Invoice <strong>${esc(payload.invoiceNumber)}</strong> for <strong>₹${esc(payload.amountInr)}</strong> is attached to your account.`,
    ],
    cta: { label: 'Download invoice', url: payload.invoiceUrl },
    text:
      `Thanks for your payment\n\n` +
      `We've received your payment for the ${payload.planName} plan.\n` +
      `Invoice ${payload.invoiceNumber} for ₹${payload.amountInr} is attached to your account.\n\n` +
      `Download invoice: ${payload.invoiceUrl}`,
  });
}
