import { Badge, type BadgeVariant } from '@jobportal/ui';
import type { ApplicationStatus } from '@jobportal/db';

// SRS §4.6 + CLAUDE.md §2 — semantic colors only. No bespoke tokens.
const VARIANT_BY_STATUS: Record<ApplicationStatus, BadgeVariant> = {
  APPLIED: 'neutral',
  IN_REVIEW: 'warning',
  SHORTLISTED: 'warning',
  INTERVIEWED: 'warning',
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
