import { Badge, type BadgeVariant } from '@jobportal/ui';

export type JobStatus = 'DRAFT' | 'PENDING_MODERATION' | 'ACTIVE' | 'EXPIRED' | 'CLOSED';

interface StatusMeta {
  variant: BadgeVariant;
  label: string;
}

// Color-coded so a recruiter can identify a posting's state at a glance.
// Open = green, Draft = grey, Expired = amber, Closed = red. PENDING_MODERATION
// is only reachable when `moderation.jobs.enabled` is ON (OFF on Day 0), so it
// normally never renders — kept distinct (navy) for exhaustiveness.
export const JOB_STATUS_META: Record<JobStatus, StatusMeta> = {
  ACTIVE: { variant: 'success', label: 'Open' },
  DRAFT: { variant: 'neutral', label: 'Draft' },
  EXPIRED: { variant: 'warning', label: 'Expired' },
  CLOSED: { variant: 'danger', label: 'Closed' },
  PENDING_MODERATION: { variant: 'primary', label: 'Pending review' },
};

/**
 * The job-status pill for the recruiter Jobs list. A small dot (in the badge's
 * own foreground color) reinforces the color-coding; the text label is what
 * actually conveys the state, so state is never signalled by color alone
 * (WCAG 1.4.1).
 */
export function JobStatusBadge({ status }: { status: JobStatus }) {
  const meta = JOB_STATUS_META[status];
  return (
    <Badge variant={meta.variant} className="gap-1.5">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {meta.label}
    </Badge>
  );
}
