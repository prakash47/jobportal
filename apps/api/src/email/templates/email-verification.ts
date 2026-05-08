import { renderLayout, type Rendered } from './_layout';
import type { EmailVerificationPayload } from './index';

export function renderEmailVerification(
  payload: EmailVerificationPayload,
): Rendered {
  const subject = 'Verify your JobPortal email';
  return renderLayout(subject, {
    preheader: 'Confirm your email address to finish setting up your account.',
    heading: 'Verify your email',
    bodyParagraphs: [
      'Click the button below to confirm your email address. The link is valid for 24 hours.',
      'If you didn’t sign up for JobPortal, you can safely ignore this message.',
    ],
    cta: { label: 'Verify email', url: payload.verifyUrl },
    text:
      `Verify your email\n\n` +
      `Click this link to confirm your email address (valid for 24 hours):\n${payload.verifyUrl}\n\n` +
      `If you didn’t sign up for JobPortal, you can safely ignore this message.`,
  });
}
