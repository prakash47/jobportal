import { Badge, type BadgeVariant } from '@jobportal/ui';
import type { ApplicationStatus } from '@jobportal/db';

// SRS §4.6 + CLAUDE.md §2 — semantic colors only. No bespoke tokens.
//
// The three middle statuses used to ALL be `warning`, so "In review",
// "Shortlisted" and "Interviewed" rendered as the same amber chip. Those are
// the three states a candidate most wants to tell apart at a glance — the whole
// point of scanning the list is seeing which applications are moving — and a
// single colour across them threw that information away.
//
// Now: grey for the passive state, amber while someone is deciding, and a
// distinct colour once you have actually progressed.
//
// Five Badge variants have to cover eight statuses, so some sharing is
// unavoidable. What remains is deliberate: SHORTLISTED / OFFERED / HIRED share
// green because they are all "this is going well", which is a far weaker
// collision than three unrelated mid-pipeline states sharing amber. Splitting
// HIRED out would mean a sixth variant in the shared Badge — a packages/ui
// change affecting all three apps — which is not worth it for one status.
const VARIANT_BY_STATUS: Record<ApplicationStatus, BadgeVariant> = {
  APPLIED: 'neutral',
  IN_REVIEW: 'warning',
  SHORTLISTED: 'success',
  INTERVIEWED: 'primary',
  OFFERED: 'success',
  HIRED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
};

const LABEL_BY_STATUS: Record<ApplicationStatus, string> = {
  APPLIED: 'Applied',
  IN_REVIEW: 'In review',
  SHORTLISTED: 'Shortlisted',
  INTERVIEWED: 'Interviewed',
  OFFERED: 'Offered',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};

export function StatusPill({ status }: { status: ApplicationStatus }) {
  return <Badge variant={VARIANT_BY_STATUS[status]}>{LABEL_BY_STATUS[status]}</Badge>;
}

// Exposed so the filter chips can render with the same labels.
export const STATUS_LABELS = LABEL_BY_STATUS;
