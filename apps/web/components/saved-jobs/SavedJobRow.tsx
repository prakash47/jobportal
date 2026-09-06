import Link from 'next/link';
import { Badge } from '@jobportal/ui';
import { ApplyButton } from '../job/ApplyButton';
import { RemoveSavedButton } from './RemoveSavedButton';
import { StatusPill } from '../applications/StatusPill';
import { formatExperienceYears, formatSalaryLpa } from '../../lib/job/format';
import type { ApplicationStatus } from '@jobportal/db';

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
    experienceMinYears: number | null;
    experienceMaxYears: number | null;
    salaryMinPaise: number | null;
    salaryMaxPaise: number | null;
  };
  /** Resolved server-side from job.cityIds in one batched query. */
  cityNames: string[];
  applied: boolean;
  appliedStatus: string | null;
  /** The application this job produced, so its status pill can link to it. */
  applicationId: number | null;
}

// Linear-style dense row inside the list card. Stacks vertically under the sm
// breakpoint so the Apply/remove actions never crush a long title.
export function SavedJobRow({
  jobId,
  savedAt,
  job,
  cityNames,
  applied,
  appliedStatus,
  applicationId,
}: SavedJobRowProps) {
  const isActive = job.status === 'ACTIVE';
  const location = cityNames.length > 0 ? cityNames.join(', ') : null;
  const experience = formatExperienceYears(job.experienceMinYears, job.experienceMaxYears);
  const salary = formatSalaryLpa(job.salaryMinPaise, job.salaryMaxPaise);
  // Only render the separator dots between facts that actually exist, so a
  // sparse posting reads "Bangalore" rather than "Bangalore • • ".
  const facts = [location, experience, salary].filter((f): f is string => Boolean(f));

  return (
    <div className="relative flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-[var(--color-bg)] sm:flex-row sm:items-center sm:gap-6 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {/* Whole-row click opens the job (title link's ::after covers the row);
              the company link + the action buttons sit above it via z-10. */}
          <Link
            href={`/job/${job.canonicalSlug}`}
            className="min-w-0 text-sm font-medium text-[var(--color-fg)] hover:underline after:absolute after:inset-0 after:content-['']"
          >
            <span className="block truncate">{job.title}</span>
          </Link>
          {!isActive && <Badge variant="neutral">{job.status.toLowerCase()}</Badge>}
        </div>
        <p className="mt-0.5 truncate text-sm text-[var(--color-fg-muted)]">
          <Link
            href={`/company/${job.company.slug}-overview-${job.company.id}`}
            className="relative z-10 hover:text-[var(--color-fg)]"
          >
            {job.company.name}
          </Link>
          <span className="mx-2" aria-hidden="true">
            ·
          </span>
          <span className="text-xs">Saved {fmt(savedAt)}</span>
        </p>

        {/*
          The facts a candidate needs to triage a saved list without opening
          each posting — and the fix for the row's dead space. Measured at a
          1600px viewport, the title column was 813px wide holding ~250px of
          text, leaving ~550px empty in every row. Widening the container was
          the wrong lever: the container was fine, the row was empty.

          Deliberately plain text with separators rather than bordered chips.
          Three bordered pills per row across fourteen rows is a lot of visual
          noise for what is secondary information, and CLAUDE.md §2 asks for
          restraint over decoration.
        */}
        {facts.length > 0 && (
          <p className="mt-1 truncate text-xs text-[var(--color-fg-muted)]">
            {facts.map((fact, i) => (
              <span key={fact}>
                {i > 0 && (
                  <span className="mx-1.5" aria-hidden="true">
                    •
                  </span>
                )}
                {fact}
              </span>
            ))}
          </p>
        )}
      </div>

      <div className="relative z-10 flex shrink-0 items-center gap-2">
        {applied ? (
          // Links to the application it describes, instead of being a dead
          // badge. Two things changed here beyond the link:
          //
          //   * it uses StatusPill, so the label reads "In review" rather than
          //     the raw "IN REVIEW" this rendered before, and
          //   * it inherits the colour hierarchy from
          //     feature/applications-badge-hierarchy — previously every status
          //     was `primary`, so a shortlisted job and a rejected one looked
          //     identical here while differing on the Applications page.
          //
          // ?status= filters the destination list to that state, which is the
          // closest this page can get to deep-linking a single application
          // without an anchor target on the row itself.
          <Link
            href={
              applicationId !== null && appliedStatus
                ? `/applications?status=${appliedStatus}`
                : '/applications'
            }
            aria-label={`View this application on the Applications page`}
            className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
          >
            <StatusPill status={(appliedStatus ?? 'APPLIED') as ApplicationStatus} />
          </Link>
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
