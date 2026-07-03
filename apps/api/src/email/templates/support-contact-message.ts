import { esc, renderLayout, type Rendered } from './_layout';
import type { SupportContactMessagePayload } from './index';

// Help & Support — a "Contact us" submission forwarded to the ops inbox. The
// SupportContactMessage DB row is the durable record; this email is a
// best-effort notification on top. Recipient is the internal ops inbox, so
// there is no per-user preference gating. Dynamic values are esc()'d (the
// layout treats bodyParagraphs/heading as already-escaped HTML); the message
// body preserves the submitter's line breaks with <br>.
export function renderSupportContactMessage(
  payload: SupportContactMessagePayload,
): Rendered {
  const subject = `[Contact] ${payload.subject}`;
  const messageHtml = esc(payload.message).replace(/\n/g, '<br>');

  return renderLayout(subject, {
    preheader: `New contact message from ${payload.name}.`,
    heading: 'New contact message',
    bodyParagraphs: [
      `<strong>From:</strong> ${esc(payload.name)} (${esc(payload.email)})`,
      `<strong>Subject:</strong> ${esc(payload.subject)}`,
      messageHtml,
      `Recorded as contact message #${payload.contactId} in the admin console.`,
    ],
    text:
      `New contact message\n\n` +
      `From: ${payload.name} (${payload.email})\n` +
      `Subject: ${payload.subject}\n\n` +
      `${payload.message}\n\n` +
      `Recorded as contact message #${payload.contactId} in the admin console.`,
  });
}
