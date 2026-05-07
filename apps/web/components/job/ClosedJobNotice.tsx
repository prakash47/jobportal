import type { JobStatus } from '@jobportal/db';
import { AlertCircle } from '@jobportal/ui/icons';

export function ClosedJobNotice({ status }: { status: JobStatus }) {
  if (status === 'ACTIVE') return null;

  const label =
    status === 'EXPIRED' ? 'This job has expired'
    : status === 'CLOSED' ? 'This job has been closed'
    : 'This job is not currently accepting applications';

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 text-sm text-[var(--color-fg-muted)]"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-[var(--color-fg-muted)]" aria-hidden="true" />
      <div>
        <p className="font-medium text-[var(--color-fg)]">{label}</p>
        <p className="mt-0.5">
          You can still browse similar opportunities below or set up a job alert to
          hear about new openings.
        </p>
      </div>
    </div>
  );
}
