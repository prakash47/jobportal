import Link from 'next/link';
import { Badge, type BadgeVariant } from '@jobportal/ui';
import { CloseJobButton, ReopenJobButton } from './JobActions';

type JobStatus = 'DRAFT' | 'PENDING_MODERATION' | 'ACTIVE' | 'EXPIRED' | 'CLOSED';

const STATUS_VARIANT: Record<JobStatus, BadgeVariant> = {
  DRAFT: 'neutral',
  PENDING_MODERATION: 'warning',
  ACTIVE: 'success',
  EXPIRED: 'neutral',
  CLOSED: 'neutral',
};

const STATUS_LABEL: Record<JobStatus, string> = {
  DRAFT: 'Draft',
  PENDING_MODERATION: 'Pending review',
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  CLOSED: 'Closed',
};

const fmt = (d: Date | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export interface JobRowProps {
  id: number;
  title: string;
  status: JobStatus;
  postedAt: Date;
  expiresAt: Date | null;
  applicantCount: number;
}

export function JobRow({ id, title, status, postedAt, expiresAt, applicantCount }: JobRowProps) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-[var(--color-border)] py-4 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/jobs/${id}/applicants`}
            className="truncate text-sm font-medium text-[var(--color-fg)] hover:underline"
          >
            {title}
          </Link>
          <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
        </div>
        <p className="mt-0.5 text-xs text-[var(--color-fg-subtle)]">
          {applicantCount} {applicantCount === 1 ? 'applicant' : 'applicants'}
          <span className="mx-2">·</span>
          Posted {fmt(postedAt)}
          {expiresAt && (
            <>
              <span className="mx-2">·</span>
              Expires {fmt(expiresAt)}
            </>
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Link
          href={`/jobs/${id}/applicants`}
          className="text-xs font-medium text-[var(--color-primary-600)] hover:underline"
        >
          Applicants →
        </Link>
        {status === 'ACTIVE' && <CloseJobButton id={id} title={title} />}
        {(status === 'CLOSED' || status === 'EXPIRED') && (
          <ReopenJobButton id={id} title={title} />
        )}
      </div>
    </div>
  );
}
