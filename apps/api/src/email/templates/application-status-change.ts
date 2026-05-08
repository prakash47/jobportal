import { esc, renderLayout, type Rendered } from './_layout';
import type { ApplicationStatusChangePayload } from './index';

const FRIENDLY: Record<string, string> = {
  APPLIED: 'Applied',
  IN_REVIEW: 'In review',
  SHORTLISTED: 'Shortlisted',
  INTERVIEWED: 'Interviewed',
  OFFERED: 'Offered',
  HIRED: 'Hired',
  REJECTED: 'Not selected',
  WITHDRAWN: 'Withdrawn',
};

function friendly(s: string): string {
  return FRIENDLY[s] ?? s;
}

export function renderApplicationStatusChange(
  payload: ApplicationStatusChangePayload,
): Rendered {
  const fromLabel = friendly(payload.from);
  const toLabel = friendly(payload.to);
  const subject = `Update on your application — ${payload.jobTitle}`;
  return renderLayout(subject, {
    preheader: `${fromLabel} → ${toLabel} for ${payload.jobTitle} at ${payload.companyName}.`,
    heading: 'Status update',
    bodyParagraphs: [
      `Your application for <strong>${esc(payload.jobTitle)}</strong> at ${esc(payload.companyName)} has moved from <strong>${esc(fromLabel)}</strong> to <strong>${esc(toLabel)}</strong>.`,
    ],
    cta: { label: 'Open application', url: payload.applicationUrl },
    text:
      `Status update\n\n` +
      `Your application for "${payload.jobTitle}" at ${payload.companyName} has moved from ${fromLabel} to ${toLabel}.\n\n` +
      `Open the application: ${payload.applicationUrl}`,
  });
}
