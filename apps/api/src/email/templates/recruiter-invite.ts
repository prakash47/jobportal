import { esc, renderLayout, type Rendered } from './_layout';
import type { RecruiterInvitePayload } from './index';

// SRS §4.9 — recruiter Team invitation. A single CTA to the accept page; the raw
// token lives only in the URL. Dynamic values are esc()'d (the layout treats
// bodyParagraphs/heading as already-escaped HTML).
export function renderRecruiterInvite(payload: RecruiterInvitePayload): Rendered {
  const subject = `You're invited to join ${payload.companyName} on Career Queue`;
  const inviter = payload.inviterName
    ? `${payload.inviterName} has invited you`
    : 'You have been invited';
  const days = Math.round(payload.expiresInHours / 24);
  const validFor =
    days >= 1 ? `${days} day${days === 1 ? '' : 's'}` : `${payload.expiresInHours} hours`;

  return renderLayout(subject, {
    preheader: `Join ${payload.companyName}'s recruiter team on Career Queue.`,
    heading: `Join ${esc(payload.companyName)} on Career Queue`,
    bodyParagraphs: [
      `${esc(inviter)} to join their recruiter team on Career Queue.`,
      `Click the button below to set up your account and get started. This invitation is valid for ${esc(validFor)}.`,
      `If you weren’t expecting this invitation, you can safely ignore this email.`,
    ],
    cta: { label: 'Accept invitation', url: payload.inviteUrl },
    text:
      `Join ${payload.companyName} on Career Queue\n\n` +
      `${inviter} to join their recruiter team on Career Queue.\n` +
      `Set up your account (valid for ${validFor}):\n${payload.inviteUrl}\n\n` +
      `If you weren’t expecting this invitation, you can safely ignore this email.`,
  });
}
