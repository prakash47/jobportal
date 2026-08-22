import { esc, renderLayout, type Rendered } from './_layout';
import type { AdminStaffInvitePayload } from './index';

// SRS §4.16 — platform-staff invitation to the internal Super Admin portal. A
// single CTA to the accept page; the raw token lives only in the URL. Dynamic
// values are esc()'d (the layout treats bodyParagraphs/heading as
// already-escaped HTML).
//
// Deliberately says nothing about which TIER the invitee was granted, and names
// no module. This mail goes to an address that has no account yet, so anyone who
// receives it in error — a mistyped address, a shared inbox, a forwarded thread
// — learns only that a Career Queue staff account was offered, never what it
// would have been able to see. The accept page shows the tier, behind the token.
export function renderAdminStaffInvite(payload: AdminStaffInvitePayload): Rendered {
  const subject = 'You have been invited to the Career Queue staff portal';
  const days = Math.round(payload.expiresInHours / 24);
  const validFor =
    days >= 1 ? `${days} day${days === 1 ? '' : 's'}` : `${payload.expiresInHours} hours`;

  return renderLayout(subject, {
    preheader: 'Set up your Career Queue staff account.',
    heading: 'Join the Career Queue staff portal',
    bodyParagraphs: [
      `You have been invited to an internal staff account on Career Queue.`,
      `Click the button below to choose a password and sign in. This invitation is valid for ${esc(validFor)}, and the link can only be used once.`,
      `If you weren’t expecting this invitation, please ignore this email and let your Career Queue contact know.`,
    ],
    cta: { label: 'Set up your account', url: payload.inviteUrl },
    text:
      `Join the Career Queue staff portal\n\n` +
      `You have been invited to an internal staff account on Career Queue.\n` +
      `Choose a password and sign in (valid for ${validFor}, single use):\n${payload.inviteUrl}\n\n` +
      `If you weren’t expecting this invitation, please ignore this email and let your Career Queue contact know.`,
  });
}
