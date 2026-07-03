import { cn } from '@jobportal/ui';
import { STATUS_LABELS } from './StatusPill';
import type { ApplicationStatus } from '@jobportal/db';

export interface HistoryEntry {
  from: ApplicationStatus;
  to: ApplicationStatus;
  at: string; // ISO
  /** Only carried through when the stored actor is a known value. */
  by?: 'CANDIDATE' | 'RECRUITER';
}

export interface TimelineStep {
  label: string;
  /** ISO — absent on the synthetic current-status step for legacy rows. */
  at?: string;
  by?: 'CANDIDATE' | 'RECRUITER';
}

// Fixed IST so the server-rendered row and this client-rendered panel always
// agree on the calendar day (production servers run UTC).
const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

// Builds the pipeline steps from the stored transition log: the original
// application first, then one step per transition (SRS §4.6 — statusHistory is
// appended on every recruiter/candidate move). Legacy/seeded rows may have no
// history: when their status has already moved past APPLIED, append a
// synthetic (undated) current step so the emphasised step never contradicts
// the status pill next to it.
export function buildSteps(
  appliedAtIso: string,
  history: HistoryEntry[],
  status: ApplicationStatus,
): TimelineStep[] {
  const steps: TimelineStep[] = [
    { label: STATUS_LABELS.APPLIED, at: appliedAtIso },
    ...history.map((h) => ({
      label: STATUS_LABELS[h.to] ?? h.to,
      at: h.at,
      ...(h.by ? { by: h.by } : {}),
    })),
  ];
  if (history.length === 0 && status !== 'APPLIED') {
    steps.push({ label: STATUS_LABELS[status] ?? status });
  }
  return steps;
}

// Vertical status pipeline: navy dots joined by a hairline, latest step
// emphasised. Flat and calm — no motion, no color noise (CLAUDE.md §2).
export function StatusTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="space-y-0">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        return (
          <li key={`${step.label}-${step.at ?? i}`} className="relative flex gap-3 pb-4 last:pb-0">
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
              {step.at ? (
                <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">
                  {fmt(step.at)}
                  {step.by ? (step.by === 'CANDIDATE' ? ' · by you' : ' · by recruiter') : ''}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
