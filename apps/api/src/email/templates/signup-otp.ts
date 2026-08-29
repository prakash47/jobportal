import { esc, renderLayout, type Rendered } from './_layout';
import type { SignupOtpPayload } from './index';

export function renderSignupOtp(payload: SignupOtpPayload): Rendered {
  const subject = 'Your Career Queue verification code';

  // Same code block as the password-reset template: letter-spaced, tabular, and
  // big enough to read off a phone at a glance. The value is a 6-digit code we
  // generated ourselves, but it is escaped anyway — the layout treats
  // bodyParagraphs as raw HTML, so escaping every interpolation is the rule
  // that keeps that contract honest rather than a judgement call per template.
  // A <span style="display:block"> rather than a <div>, because the layout
  // wraps each paragraph in a <p> and a <div> inside a <p> is invalid.
  const codeBlock =
    `<span style="display:block;margin:8px 0 4px 0;padding:16px 20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;` +
    `font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:30px;font-weight:700;` +
    `letter-spacing:0.28em;text-align:center;color:#111827;">${esc(payload.code)}</span>`;

  return renderLayout(subject, {
    preheader: `Your verification code — valid for ${payload.expiresInMinutes} minutes.`,
    heading: 'Confirm your email address',
    bodyParagraphs: [
      `Hi ${esc(payload.name)}, enter this code to finish creating your Career Queue account:`,
      codeBlock,
      `The code is valid for ${payload.expiresInMinutes} minutes and can only be used once.`,
      // Deliberately reassuring rather than alarming: at this point NO account
      // exists, so an unexpected code means somebody typed this address in by
      // mistake — or on purpose — and ignoring it genuinely ends the matter.
      'If you didn’t start this, you can ignore this email. No account has been created, and none will be without this code.',
    ],
    text:
      `Confirm your email address\n\n` +
      `Hi ${payload.name}, enter this code to finish creating your Career Queue account:\n\n` +
      `    ${payload.code}\n\n` +
      `The code is valid for ${payload.expiresInMinutes} minutes and can only be used once.\n\n` +
      `If you didn’t start this, you can ignore this email. No account has been created, and none will be without this code.`,
  });
}
