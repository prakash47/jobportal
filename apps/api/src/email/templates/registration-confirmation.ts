import { esc, renderLayout, type Rendered } from './_layout';
import type { RegistrationConfirmationPayload } from './index';

export function renderRegistrationConfirmation(
  payload: RegistrationConfirmationPayload,
): Rendered {
  const subject = 'Welcome to JobPortal';
  return renderLayout(subject, {
    preheader: `Your JobPortal account is ready, ${payload.name}.`,
    heading: `Welcome, ${esc(payload.name)}.`,
    bodyParagraphs: [
      'Your JobPortal account is ready to go. Complete your profile to start applying — recruiters can only contact you once you have a headline and at least one resume on file.',
      'A separate email is on its way to confirm your address.',
    ],
    text:
      `Welcome, ${payload.name}.\n\n` +
      `Your JobPortal account is ready to go. Complete your profile to start applying — recruiters can only contact you once you have a headline and at least one resume on file.\n\n` +
      `A separate email is on its way to confirm your address.`,
  });
}
