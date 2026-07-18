// Shared source of truth for the recruiter applicant-list filters. Both the
// Jobs-list candidate-count columns (which build `?filter=` deep-links) and the
// applicants page (which parses `?filter=`) import from here so the two can
// never drift. Side-effect-free; safe to import from server and client.

export type ApplicantFilter = 'new' | 'shortlisted' | 'rejected' | 'matched';

// Order used to render the applicants filter tabs (after the implicit "All").
export const APPLICANT_FILTER_ORDER: readonly ApplicantFilter[] = [
  'new',
  'shortlisted',
  'rejected',
  'matched',
];

export const APPLICANT_FILTER_LABELS: Record<ApplicantFilter, string> = {
  new: 'New',
  shortlisted: 'Shortlisted',
  rejected: 'Rejected',
  matched: 'Matches',
};

const VALID = new Set<string>(APPLICANT_FILTER_ORDER);

/** Narrow an untrusted `?filter=` value to a known filter, else null (= All). */
export function parseApplicantFilter(raw: string | string[] | undefined | null): ApplicantFilter | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && VALID.has(value) ? (value as ApplicantFilter) : null;
}
