import { Badge, cn, type BadgeVariant } from '@jobportal/ui';
import { NEUTRAL_ON_ANY_SURFACE } from '../badge-surface';

export type JobStatus = 'DRAFT' | 'PENDING_MODERATION' | 'ACTIVE' | 'EXPIRED' | 'CLOSED';

interface StatusMeta {
  variant: BadgeVariant;
  label: string;
  // Foreground override to meet WCAG AA (4.5:1) on the light tint pills. The
  // shared Badge's `success`/`danger` foregrounds are too light for their
  // fixed light backgrounds (~2.6:1 / ~3.6:1). We darken ONLY here (via a
  // className that tailwind-merge lets win) so the shared Badge — used by the
  // job-seeker + services apps too — stays byte-untouched. The dot inherits
  // this via `bg-current`. oklch mirrors Badge's own hardcoded tints.
  fgClass?: string;
}

// Color-coded so a recruiter can identify a posting's state at a glance.
// Open = green, Draft = grey, Expired = amber, Closed = red. PENDING_MODERATION
// is only reachable when `moderation.jobs.enabled` is ON (OFF on Day 0), so it
// normally never renders — kept distinct (navy) for exhaustiveness.
export const JOB_STATUS_META: Record<JobStatus, StatusMeta> = {
  ACTIVE: { variant: 'success', label: 'Open', fgClass: 'text-[oklch(0.52_0.15_145)]' },
  DRAFT: { variant: 'neutral', label: 'Draft' },
  EXPIRED: { variant: 'warning', label: 'Expired' },
  CLOSED: { variant: 'danger', label: 'Closed', fgClass: 'text-[oklch(0.52_0.20_25)]' },
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
    <Badge
      variant={meta.variant}
      className={cn('gap-1.5', meta.fgClass, meta.variant === 'neutral' && NEUTRAL_ON_ANY_SURFACE)}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {meta.label}
    </Badge>
  );
}
