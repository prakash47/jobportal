import Link from 'next/link';
import type { ApplicationStatus } from '@jobportal/db';
import { StatusPill } from './StatusPill';
import { WithdrawButton } from './WithdrawButton';

const fmt = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// SRS §4.6.2 — terminal statuses don't expose Withdraw.
const TERMINAL = new Set<ApplicationStatus>(['HIRED', 'REJECTED', 'WITHDRAWN']);

export interface ApplicationRowProps {
  id: number;
  status: ApplicationStatus;
  appliedAt: Date;
  job: {
    title: string;
    canonicalSlug: string;
    company: { name: string; slug: string; id: number };
  };
}

export function ApplicationRow({ id, status, appliedAt, job }: ApplicationRowProps) {
  const canWithdraw = !TERMINAL.has(status);

  return (
    <div className="flex items-center justify-between gap-6 border-b border-[var(--color-border)] py-4 last:border-b-0">
      <div className="min-w-0 flex-1">
        <Link
          href={`/job/${job.canonicalSlug}`}
          className="block truncate text-sm font-medium text-[var(--color-fg)] hover:underline"
        >
          {job.title}
        </Link>
        <p className="mt-0.5 truncate text-sm text-[var(--color-fg-muted)]">
          <Link
            href={`/${job.company.slug}-overview-${job.company.id}`}
            className="hover:text-[var(--color-fg)]"
          >
            {job.company.name}
          </Link>
          <span className="mx-2 text-[var(--color-fg-subtle)]">·</span>
          <span className="text-xs text-[var(--color-fg-subtle)]">Applied {fmt(appliedAt)}</span>
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <StatusPill status={status} />
        {canWithdraw && <WithdrawButton applicationId={id} jobTitle={job.title} />}
      </div>
    </div>
  );
}
