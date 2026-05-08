import { renderLayout, type Rendered } from './_layout';
import type { RegistrationConfirmationPayload } from './index';

// Layout fields (preheader / heading) are escaped inside renderLayout, so
// pass plain text here. bodyParagraphs is the only field that takes raw
// HTML (so callers can interleave <strong> etc.) and is the only field
// where the caller is responsible for escaping user-controlled values.
export function renderRegistrationConfirmation(
  payload: RegistrationConfirmationPayload,
): Rendered {
  const subject = 'Welcome to JobPortal';
  return renderLayout(subject, {
    preheader: `Your JobPortal account is ready, ${payload.name}.`,
    heading: `Welcome, ${payload.name}.`,
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
