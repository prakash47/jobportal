import { esc, renderLayout, type Rendered } from './_layout';
import type { ApplicationSubmittedPayload } from './index';

export function renderApplicationSubmitted(
  payload: ApplicationSubmittedPayload,
): Rendered {
  const subject = `Application received — ${payload.jobTitle}`;
  return renderLayout(subject, {
    preheader: `Your application for ${payload.jobTitle} at ${payload.companyName} is in.`,
    heading: 'Application received',
    bodyParagraphs: [
      `Your application for <strong>${esc(payload.jobTitle)}</strong> at ${esc(payload.companyName)} has been submitted.`,
      'You’ll get an email each time the recruiter updates your application status. Track everything in one place from your dashboard.',
    ],
    cta: { label: 'View application', url: payload.applicationUrl },
    text:
      `Application received\n\n` +
      `Your application for "${payload.jobTitle}" at ${payload.companyName} has been submitted.\n\n` +
      `You'll get an email each time the recruiter updates your application status. Track everything in one place:\n${payload.applicationUrl}`,
  });
}
