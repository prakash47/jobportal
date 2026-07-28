import type { JobStatus } from '@jobportal/db';
import { AlertCircle } from '@jobportal/ui/icons';

export function ClosedJobNotice({ status }: { status: JobStatus }) {
  if (status === 'ACTIVE') return null;

  // DRAFT / PENDING_MODERATION only reach this component for the people allowed
  // to preview an unpublished job (owner, collaborators, admins) — everyone else
  // gets a 404 from the page's visibility gate. So the copy addresses the
  // recruiter looking at their own posting, not a job seeker: telling them to
  // "browse similar opportunities" would be nonsense.
  const isPreview = status === 'DRAFT' || status === 'PENDING_MODERATION';

  const label =
    status === 'EXPIRED' ? 'This job has expired'
    : status === 'CLOSED' ? 'This job has been closed'
    : status === 'PENDING_MODERATION' ? 'This job is awaiting review'
    : 'This job is a draft';

  const detail =
    status === 'PENDING_MODERATION' ?
      'Only you can see this page. It will be publicly visible once an administrator approves it.'
    : isPreview ? 'Only you can see this page. Publish the job to make it publicly visible.'
    : 'You can still browse similar opportunities below or set up a job alert to hear about new openings.';

  return (
    <div
      role="status"
      // Fill note: --color-surface-subtle was never defined in theme.css, so this
      // panel previously rendered with NO background at all. --color-bg-muted is
      // the token the rest of the app uses for a subtle inset surface, and is the
      // same substitution PostJobFlow and PostJobWizard already made.
      className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-muted)] p-4 text-sm text-[var(--color-fg-muted)]"
    >
      <AlertCircle
        className="mt-0.5 size-4 shrink-0 text-[var(--color-fg-muted)]"
        aria-hidden="true"
      />
      <div>
        <p className="font-medium text-[var(--color-fg)]">{label}</p>
        <p className="mt-0.5">{detail}</p>
      </div>
    </div>
  );
}
