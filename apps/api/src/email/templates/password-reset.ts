import { renderLayout, type Rendered } from './_layout';
import type { PasswordResetPayload } from './index';

export function renderPasswordReset(payload: PasswordResetPayload): Rendered {
  const subject = 'Reset your JobPortal password';
  return renderLayout(subject, {
    preheader: `Password reset link inside — valid for ${payload.expiresInMinutes} minutes.`,
    heading: 'Reset your password',
    bodyParagraphs: [
      `We received a request to reset your password. Click below to set a new one — the link is valid for ${payload.expiresInMinutes} minutes.`,
      'If you didn’t request this, you can ignore this email and your password will stay the same.',
    ],
    cta: { label: 'Reset password', url: payload.resetUrl },
    text:
      `Reset your password\n\n` +
      `We received a request to reset your password. Open this link to set a new one (valid for ${payload.expiresInMinutes} minutes):\n${payload.resetUrl}\n\n` +
      `If you didn’t request this, you can ignore this email and your password will stay the same.`,
  });
}
