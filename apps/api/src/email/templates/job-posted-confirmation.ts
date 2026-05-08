import { esc, renderLayout, type Rendered } from './_layout';
import type { JobPostedConfirmationPayload } from './index';

export function renderJobPostedConfirmation(
  payload: JobPostedConfirmationPayload,
): Rendered {
  const subject = `Posted: ${payload.jobTitle}`;
  return renderLayout(subject, {
    preheader: `${payload.jobTitle} is live on JobPortal.`,
    heading: 'Your job is live',
    bodyParagraphs: [
      `<strong>${esc(payload.jobTitle)}</strong> is now live and visible in search.`,
      `You’ll start seeing applicants in your dashboard as candidates apply.`,
    ],
    cta: { label: 'View applicants', url: payload.applicantsUrl },
    text:
      `Your job is live\n\n` +
      `"${payload.jobTitle}" is now live and visible in search.\n\n` +
      `Public listing: ${payload.jobUrl}\n` +
      `View applicants: ${payload.applicantsUrl}`,
  });
}
