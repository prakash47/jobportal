import { esc, renderLayout, type Rendered } from './_layout';
import type { PasswordResetPayload } from './index';

export function renderPasswordReset(payload: PasswordResetPayload): Rendered {
  const subject = 'Your JobPortal password reset code';
  // Letter-spaced, tabular, and large enough to read off a phone at a glance.
  // The value is a 6-digit code we generated, but it is escaped anyway — the
  // layout treats bodyParagraphs as raw HTML, so escaping here is the rule that
  // keeps that contract honest rather than a judgement call per template.
  // A <span style="display:block"> rather than a <div>: the layout wraps every
  // bodyParagraphs entry in a <p>, and a <div> inside a <p> is invalid — the
  // parser implicitly closes the paragraph, leaving a stray empty <p> wrapped
  // around the one element this whole email exists to deliver. A span is
  // phrasing content, so it nests legally and renders identically.
  const codeBlock =
    `<span style="display:block;margin:8px 0 4px 0;padding:16px 20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;` +
    `font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:30px;font-weight:700;` +
    `letter-spacing:0.28em;text-align:center;color:#111827;">${esc(payload.code)}</span>`;

  return renderLayout(subject, {
    preheader: `Your password reset code — valid for ${payload.expiresInMinutes} minutes.`,
    heading: 'Your password reset code',
    bodyParagraphs: [
      'Enter this code on the password reset screen to continue:',
      codeBlock,
      `The code is valid for ${payload.expiresInMinutes} minutes and can only be used once.`,
      'If you didn’t request this, you can ignore this email — your password will stay the same, and nobody can change it without this code.',
    ],
    text:
      `Your password reset code\n\n` +
      `Enter this code on the password reset screen to continue:\n\n` +
      `    ${payload.code}\n\n` +
      `The code is valid for ${payload.expiresInMinutes} minutes and can only be used once.\n\n` +
      `If you didn’t request this, you can ignore this email — your password will stay the same, and nobody can change it without this code.`,
  });
}
