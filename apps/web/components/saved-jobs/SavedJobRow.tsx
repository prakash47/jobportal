'use client';

import Link from 'next/link';
import { Badge, Button, Checkbox } from '@jobportal/ui';
import { ApplyButton } from '../job/ApplyButton';
import { StatusPill } from '../applications/StatusPill';
import { formatExperienceYears, formatSalaryLpa } from '../../lib/job/format';
import type { ApplicationStatus } from '@jobportal/db';

/**
 * One saved-job row's data, fully serialised on the server.
 *
 * `savedAtLabel` is a pre-formatted string rather than a Date: the row is a
 * client component now (it owns a checkbox), and formatting a date on both
 * sides of the boundary is how an ICU/timezone difference becomes a hydration
 * mismatch. The applications list learned the same lesson.
 */
export interface SavedJobRowData {
  jobId: number;
  savedAtLabel: string;
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
  cityNames: string[];
  applied: boolean;
  appliedStatus: string | null;
  applicationId: number | null;
}

export interface SavedJobRowProps {
  data: SavedJobRowData;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  onRemove: () => void;
  busy: boolean;
}

// Linear-style dense row inside the list card. Stacks vertically under the sm
// breakpoint so the Apply/remove actions never crush a long title.
export function SavedJobRow({ data, selected, onSelectedChange, onRemove, busy }: SavedJobRowProps) {
  const { jobId, savedAtLabel, job, cityNames, applied, appliedStatus, applicationId } = data;
  const isActive = job.status === 'ACTIVE';
  const location = cityNames.length > 0 ? cityNames.join(', ') : null;
  const experience = formatExperienceYears(job.experienceMinYears, job.experienceMaxYears);
  const salary = formatSalaryLpa(job.salaryMinPaise, job.salaryMaxPaise);
  // Only facts that exist, so a sparse posting reads "Bangalore" rather than
  // "Bangalore • • ".
  const facts = [location, experience, salary].filter((f): f is string => Boolean(f));

  return (
    <div
      className={cnRow(selected)}
      // Not aria-selected: that belongs to listbox/grid roles, and this is a
      // plain list of links. The checkbox carries the state for assistive tech.
    >
      <div className="relative z-10 flex shrink-0 items-center pt-0.5 sm:pt-0">
        <Checkbox
          checked={selected}
          onCheckedChange={(v) => onSelectedChange(v === true)}
          aria-label={`Select ${job.title}`}
          disabled={busy}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {/* Whole-row click opens the job (title link's ::after covers the row);
              the checkbox, company link and actions sit above it via z-10. */}
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
          <span className="text-xs">Saved {savedAtLabel}</span>
        </p>

        {/* The facts needed to triage a saved list without opening each posting,
            and the fix for the row's dead space. Plain text with separators
            rather than bordered chips: three pills across a dozen rows is a lot
            of noise for secondary information. */}
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
          // Links to the application it describes rather than being a dead
          // badge, and uses StatusPill so the label and colour match the
          // Applications page exactly.
          <Link
            href={
              applicationId !== null && appliedStatus
                ? `/applications?status=${appliedStatus}`
                : '/applications'
            }
            aria-label="View this application on the Applications page"
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
        {/* Remove is handled by the parent so a single removal and a bulk
            removal share one code path, one toast and one undo. */}
        <Button variant="ghost" size="sm" onClick={onRemove} disabled={busy}>
          Remove
        </Button>
      </div>
    </div>
  );
}

function cnRow(selected: boolean): string {
  return [
    'relative flex flex-col gap-3 px-4 py-4 transition-colors sm:flex-row sm:items-center sm:gap-4 sm:px-5',
    selected ? 'bg-[var(--color-bg-muted)]' : 'hover:bg-[var(--color-bg)]',
  ].join(' ');
}
