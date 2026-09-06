'use client';

import { useId, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@jobportal/ui';
import { ChevronDown, Building2, Clock, FileText, MapPin } from '@jobportal/ui/icons';
import { EMPLOYMENT_LABELS, WORK_MODE_LABELS } from '../../lib/job/format';
import type { ApplicationStatus } from '@jobportal/db';
import { StatusPill } from './StatusPill';
import { WithdrawButton } from './WithdrawButton';
import { StatusTimeline, buildSteps, type HistoryEntry } from './StatusTimeline';

// SRS §4.6.2 — terminal statuses don't expose Withdraw.
const TERMINAL = new Set<ApplicationStatus>(['HIRED', 'REJECTED', 'WITHDRAWN']);

export interface ApplicationRowProps {
  id: number;
  status: ApplicationStatus;
  /** ISO string — feeds the timeline steps (client component, serialisable). */
  appliedAtIso: string;
  /** Pre-formatted on the server so SSR and hydration can't disagree (ICU/TZ). */
  appliedAtLabel: string;
  history: HistoryEntry[];
  job: {
    title: string;
    canonicalSlug: string;
    company: { name: string; slug: string; id: number };
    employmentType: string;
    workMode: string;
    cityNames: string[];
  };
  /** Free-text note submitted with the application. Null for most. */
  coverLetter: string | null;
  /**
   * The resume SNAPSHOT for this application — not the candidate's current CV.
   * Null for the ~373 applications that predate Application.resumeId, where
   * which file was actually sent is genuinely unknown and must not be guessed.
   */
  resume: { originalFilename: string; uploadedAtLabel: string; sizeBytes: number } | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// One "at a glance" job fact. Renders nothing when the value is absent, so a
// sparse posting stays clean rather than showing a placeholder dash — the same
// rule JobOverviewCard follows.
function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-fg-muted)]">
      <span className="shrink-0" aria-hidden="true">
        {icon}
      </span>
      {children}
    </span>
  );
}

// One application: title / company / date, status badge + actions, and an
// expandable status-pipeline timeline built from Application.statusHistory.
// Stacks vertically under the sm breakpoint so actions never crush the title.
export function ApplicationRow({
  id,
  status,
  appliedAtIso,
  appliedAtLabel,
  history,
  job,
  coverLetter,
  resume,
}: ApplicationRowProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const canWithdraw = !TERMINAL.has(status);
  const steps = buildSteps(appliedAtIso, history, status);

  return (
    <div className="px-4 py-4 transition-colors hover:bg-[var(--color-bg)] sm:px-5">
      {/* `relative` scopes the title's ::after overlay to THIS top row only, so
          clicking the row opens the job but the expandable timeline panel below
          (a sibling) stays free. The company link + actions get z-10 to sit
          above the overlay. */}
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <div className="min-w-0 flex-1">
          <Link
            href={`/job/${job.canonicalSlug}`}
            className="block text-sm font-medium text-[var(--color-fg)] hover:underline after:absolute after:inset-0 after:content-['']"
          >
            <span className="block truncate">{job.title}</span>
          </Link>
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
            <span className="text-xs">Applied {appliedAtLabel}</span>
          </p>
        </div>

        <div className="relative z-10 flex shrink-0 items-center gap-3">
          <StatusPill status={status} />
          {canWithdraw && <WithdrawButton applicationId={id} jobTitle={job.title} />}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label="Status history"
            className="rounded-md p-1.5 text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            <ChevronDown
              className={cn('size-4 transition-transform duration-200', open && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {open && (
        <div
          id={panelId}
          className="mt-4 space-y-4 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-4"
        >
          {/* Item #5 — the job facts a candidate needs to recall what they
              applied to, without opening the posting. Same vocabulary and label
              tables as JobOverviewCard so the two never describe the same job
              differently. NOTE: no "Notice period" row — Job has no such field
              (noticePeriodDays is on Candidate, i.e. the applicant's own notice,
              not the posting's). Inventing one here would have meant showing a
              number that means something else. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {job.cityNames.length > 0 && (
              <Fact icon={<MapPin className="size-3.5" />}>{job.cityNames.join(', ')}</Fact>
            )}
            <Fact icon={<Building2 className="size-3.5" />}>
              {WORK_MODE_LABELS[job.workMode] ?? job.workMode}
            </Fact>
            <Fact icon={<Clock className="size-3.5" />}>
              {EMPLOYMENT_LABELS[job.employmentType] ?? job.employmentType}
            </Fact>
          </div>

          {/* Item #4 — WHICH resume went with this application. */}
          <div className="border-t border-[var(--color-border)] pt-4">
            <h4 className="text-xs font-semibold text-[var(--color-fg)]">Submitted with</h4>
            {resume ? (
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-fg-muted)]">
                <FileText className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="font-medium text-[var(--color-fg)]">
                  {resume.originalFilename}
                </span>
                <span aria-hidden="true">·</span>
                <span>{formatBytes(resume.sizeBytes)}</span>
                <span aria-hidden="true">·</span>
                <span>uploaded {resume.uploadedAtLabel}</span>
              </p>
            ) : (
              // Deliberately not "your current resume": for these older rows the
              // file that was actually sent is unknown, and claiming otherwise
              // would be a guess presented as a fact.
              <p className="mt-1.5 text-xs text-[var(--color-fg-muted)]">
                Not recorded for this application.
              </p>
            )}
          </div>

          {coverLetter && (
            <div className="border-t border-[var(--color-border)] pt-4">
              <h4 className="text-xs font-semibold text-[var(--color-fg)]">Cover note</h4>
              {/* whitespace-pre-line keeps the candidate's paragraph breaks;
                  the value is rendered as TEXT, never as HTML. */}
              <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-[var(--color-fg-muted)]">
                {coverLetter}
              </p>
            </div>
          )}

          <div className="border-t border-[var(--color-border)] pt-4">
            <h4 className="mb-3 text-xs font-semibold text-[var(--color-fg)]">Progress</h4>
            <StatusTimeline steps={steps} />
          </div>
        </div>
      )}
    </div>
  );
}
