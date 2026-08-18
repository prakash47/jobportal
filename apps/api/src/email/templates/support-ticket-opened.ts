import { esc, renderLayout, type Rendered } from './_layout';
import type { SupportTicketOpenedPayload } from './index';

// Help & Support — a recruiter raised a new support ticket. Forwarded to the
// ops inbox as a best-effort notification; the SupportTicket DB row is the
// record and replies are made from the Super Admin console. All dynamic values
// are esc()'d; the description preserves the recruiter's line breaks with <br>.
//
// ⚠ The console moved from apps/web's /admin/support to /sadmin/support in
// feature/sadmin-support-console, and the old subtree was DELETED — so the bare
// "/admin/support" this template used to print now names a 404. It is a real
// absolute deep link to the ticket now rather than a path, because the reader is
// in an email client with no site context: a bare path is not clickable there,
// and staff had to know which portal it meant.
//
// `${SADMIN_URL}/sadmin/...` and not `${SADMIN_URL}/...`: that app sets
// basePath '/sadmin', which next/link prefixes internally but which is NOT part
// of any env var. Getting this wrong yields a link that 404s.
export function renderSupportTicketOpened(
  payload: SupportTicketOpenedPayload,
): Rendered {
  const subject = `[Ticket #${payload.ticketId}] ${payload.subject}`;
  const descriptionHtml = esc(payload.description).replace(/\n/g, '<br>');
  // Same `?? localhost` shape every other absolute link in apps/api uses
  // (recruiter-users, recruiter-billing, job-publish-effects). SADMIN_URL is
  // declared in .env.example but is absent from the working .env, so the
  // fallback is what actually renders in local development.
  const sadminBase = process.env.SADMIN_URL ?? 'http://localhost:3003';
  // payload.ticketId is a number from the DB, so it needs no escaping for the
  // URL — but it is esc()'d in the visible text below like every other value.
  const ticketUrl = `${sadminBase}/sadmin/support/${payload.ticketId}`;

  return renderLayout(subject, {
    preheader: `New support ticket from ${payload.recruiterName} at ${payload.companyName}.`,
    heading: `New support ticket #${payload.ticketId}`,
    bodyParagraphs: [
      `<strong>Category:</strong> ${esc(payload.category)}`,
      `<strong>Company:</strong> ${esc(payload.companyName)}`,
      `<strong>Raised by:</strong> ${esc(payload.recruiterName)} (${esc(payload.recruiterEmail)})`,
      descriptionHtml,
      `Reply to this ticket in the Super Admin console: <a href="${esc(ticketUrl)}">${esc(ticketUrl)}</a>`,
    ],
    text:
      `New support ticket #${payload.ticketId}\n\n` +
      `Category: ${payload.category}\n` +
      `Company: ${payload.companyName}\n` +
      `Raised by: ${payload.recruiterName} (${payload.recruiterEmail})\n\n` +
      `${payload.description}\n\n` +
      `Reply to this ticket in the Super Admin console:\n${ticketUrl}`,
  });
}
