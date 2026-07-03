import { esc, renderLayout, type Rendered } from './_layout';
import type { SupportTicketOpenedPayload } from './index';

// Help & Support — a recruiter raised a new support ticket. Forwarded to the
// ops inbox as a best-effort notification; the SupportTicket DB row is the
// record and replies are made from the admin console (/admin/support). All
// dynamic values are esc()'d; the description preserves the recruiter's line
// breaks with <br>.
export function renderSupportTicketOpened(
  payload: SupportTicketOpenedPayload,
): Rendered {
  const subject = `[Ticket #${payload.ticketId}] ${payload.subject}`;
  const descriptionHtml = esc(payload.description).replace(/\n/g, '<br>');

  return renderLayout(subject, {
    preheader: `New support ticket from ${payload.recruiterName} at ${payload.companyName}.`,
    heading: `New support ticket #${payload.ticketId}`,
    bodyParagraphs: [
      `<strong>Category:</strong> ${esc(payload.category)}`,
      `<strong>Company:</strong> ${esc(payload.companyName)}`,
      `<strong>Raised by:</strong> ${esc(payload.recruiterName)} (${esc(payload.recruiterEmail)})`,
      descriptionHtml,
      'Reply to this ticket from the admin console (/admin/support).',
    ],
    text:
      `New support ticket #${payload.ticketId}\n\n` +
      `Category: ${payload.category}\n` +
      `Company: ${payload.companyName}\n` +
      `Raised by: ${payload.recruiterName} (${payload.recruiterEmail})\n\n` +
      `${payload.description}\n\n` +
      `Reply to this ticket from the admin console (/admin/support).`,
  });
}
