import type { ContentReportReason } from '@jobportal/db';

// Copy + status mapping for the "Report this job" control.
//
// This lives in lib/ rather than beside the component on purpose: apps/web's
// vitest config only collects `lib/**/*.test.ts`, and nothing in the repo can
// render a component or a page. Logic left in components/ is unverifiable, which
// is exactly how a label table shipped claiming LinkedIn signups authenticate
// through Apple.

// Keyed by the Prisma enum, so adding a reason to the schema without adding a
// label here fails to compile rather than rendering a raw SCREAMING_CASE value
// to a job seeker.
export const REPORT_REASON_LABELS: Record<ContentReportReason, string> = {
  FAKE_OR_SCAM: 'Fake or scam listing',
  MISLEADING: 'Misleading details (salary, role or location)',
  DISCRIMINATORY: 'Discriminatory language',
  OFFENSIVE: 'Offensive or inappropriate content',
  DUPLICATE: 'Duplicate of another posting',
  OTHER: 'Something else',
};

// Display order. Deliberately not `Object.keys(REPORT_REASON_LABELS)`: key order
// is an implementation detail, and "Something else" must stay last so it reads
// as the fallback rather than a peer.
export const REPORT_REASON_ORDER: readonly ContentReportReason[] = [
  'FAKE_OR_SCAM',
  'MISLEADING',
  'DISCRIMINATORY',
  'OFFENSIVE',
  'DUPLICATE',
  'OTHER',
];

// Matches CreateReportDto's cap, so the client stops the user at the same point
// the server would reject them. The DTO stays the authority — this is UX.
export const REPORT_DETAILS_MAX = 2000;

// What to tell the reporter when POST /v1/reports does not return 201.
//
// Every branch says what happened AND whether it is worth retrying, because the
// dialog closes on success and this text is the only feedback there is. Nothing
// here reveals report state — a 409 already tells the caller they reported this
// job before, which is theirs to know, but no other status leaks anything about
// the queue.
export function reportErrorMessage(status: number): string {
  switch (status) {
    case 409:
      // The one-open-report-per-person rule. Only reachable when signed in.
      return 'You have already reported this job. Our team is looking into it.';
    case 429:
      return 'You have sent several reports in a short time. Please wait a minute and try again.';
    case 503:
      // The moderation.reports.enabled L3 gate. Distinct from a crash: it is
      // deliberate and temporary, so the copy says so rather than blaming them.
      return 'Reporting is temporarily unavailable. Please try again later.';
    case 404:
      return 'This job is no longer available, so it cannot be reported.';
    case 400:
      // Should be unreachable — the form only submits values the DTO accepts.
      // Kept honest rather than silent so a contract drift is visible in the UI
      // instead of looking like a network error.
      return 'That report could not be submitted. Please check your details and try again.';
    default:
      return 'Something went wrong sending your report. Please try again.';
  }
}
