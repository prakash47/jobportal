'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { cn } from '@jobportal/ui';
import { ChevronDown } from '@jobportal/ui/icons';
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
  };
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
}: ApplicationRowProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const canWithdraw = !TERMINAL.has(status);
  const steps = buildSteps(appliedAtIso, history, status);

  return (
    <div className="px-4 py-4 transition-colors hover:bg-[var(--color-bg)] sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <div className="min-w-0 flex-1">
          <Link
            href={`/job/${job.canonicalSlug}`}
            className="block truncate text-sm font-medium text-[var(--color-fg)] hover:underline"
          >
            {job.title}
          </Link>
          <p className="mt-0.5 truncate text-sm text-[var(--color-fg-muted)]">
            <Link
              href={`/company/${job.company.slug}-overview-${job.company.id}`}
              className="hover:text-[var(--color-fg)]"
            >
              {job.company.name}
            </Link>
            <span className="mx-2" aria-hidden="true">
              ·
            </span>
            <span className="text-xs">Applied {appliedAtLabel}</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
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
          className="mt-4 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-4"
        >
          <StatusTimeline steps={steps} />
        </div>
      )}
    </div>
  );
}
