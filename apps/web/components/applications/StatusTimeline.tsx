import { cn } from '@jobportal/ui';
import { STATUS_LABELS } from './StatusPill';
import type { ApplicationStatus } from '@jobportal/db';

export interface HistoryEntry {
  from: ApplicationStatus;
  to: ApplicationStatus;
  at: string; // ISO
  by: 'CANDIDATE' | 'RECRUITER';
}

export interface TimelineStep {
  label: string;
  at: string; // ISO
  by?: 'CANDIDATE' | 'RECRUITER';
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// Builds the pipeline steps from the stored transition log: the original
// application first, then one step per transition (SRS §4.6 — statusHistory is
// appended on every recruiter/candidate move). Old rows may have no history at
// all; they render as the single "Applied" step.
export function buildSteps(appliedAtIso: string, history: HistoryEntry[]): TimelineStep[] {
  return [
    { label: STATUS_LABELS.APPLIED, at: appliedAtIso },
    ...history.map((h) => ({ label: STATUS_LABELS[h.to] ?? h.to, at: h.at, by: h.by })),
  ];
}

// Vertical status pipeline: navy dots joined by a hairline, latest step
// emphasised. Flat and calm — no motion, no color noise (CLAUDE.md §2).
export function StatusTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="space-y-0">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        return (
          <li key={`${step.label}-${step.at}`} className="relative flex gap-3 pb-4 last:pb-0">
            {/* Connector line to the next step */}
            {!isLast && (
              <span
                aria-hidden="true"
                className="absolute left-[5px] top-4 h-full w-px bg-[var(--color-border)]"
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                'relative mt-1 size-[11px] shrink-0 rounded-full border-2',
                isLast
                  ? 'border-[var(--color-primary-600)] bg-[var(--color-primary-600)]'
                  : 'border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)]',
              )}
            />
            <div className="min-w-0">
              <p
                className={cn(
                  'text-sm leading-tight',
                  isLast
                    ? 'font-medium text-[var(--color-fg)]'
                    : 'text-[var(--color-fg-muted)]',
                )}
              >
                {step.label}
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">
                {fmt(step.at)}
                {step.by ? (step.by === 'CANDIDATE' ? ' · by you' : ' · by recruiter') : ''}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
