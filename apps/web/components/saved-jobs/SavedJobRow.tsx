import Link from 'next/link';
import { Badge } from '@jobportal/ui';
import { ApplyButton } from '../job/ApplyButton';
import { RemoveSavedButton } from './RemoveSavedButton';

const fmt = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export interface SavedJobRowProps {
  jobId: number;
  savedAt: Date;
  job: {
    id: number;
    title: string;
    canonicalSlug: string;
    status: string;
    company: { name: string; slug: string; id: number };
  };
  applied: boolean;
  appliedStatus: string | null;
}

// Linear-style dense row: 56-px height, single border, calm spacing. No card
// shadow; the surrounding list provides the structure.
export function SavedJobRow({ jobId, savedAt, job, applied, appliedStatus }: SavedJobRowProps) {
  const isActive = job.status === 'ACTIVE';

  return (
    <div className="flex items-center justify-between gap-6 border-b border-[var(--color-border)] py-4 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/job/${job.canonicalSlug}`}
            className="truncate text-sm font-medium text-[var(--color-fg)] hover:underline"
          >
            {job.title}
          </Link>
          {!isActive && <Badge variant="neutral">{job.status.toLowerCase()}</Badge>}
        </div>
        <p className="mt-0.5 truncate text-sm text-[var(--color-fg-muted)]">
          <Link
            href={`/${job.company.slug}-overview-${job.company.id}`}
            className="hover:text-[var(--color-fg)]"
          >
            {job.company.name}
          </Link>
          <span className="mx-2 text-[var(--color-fg-subtle)]">·</span>
          <span className="text-xs text-[var(--color-fg-subtle)]">
            Saved {fmt(savedAt)}
          </span>
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {applied ? (
          <Badge variant="primary">{(appliedStatus ?? 'APPLIED').replace('_', ' ')}</Badge>
        ) : (
          <ApplyButton
            jobId={jobId}
            jobSlug={job.canonicalSlug}
            isAuthed
            initialApplied={false}
            disabled={!isActive}
          />
        )}
        <RemoveSavedButton jobId={jobId} />
      </div>
    </div>
  );
}
