'use client';

import type { ReactNode } from 'react';
import { cn } from '@jobportal/ui';
import { Check, Pencil } from '@jobportal/ui/icons';

// One row of the reset ledger: a marker in the gutter, a spine segment linking
// it to the next row, and a body that is either the live step, a one-line
// receipt of what the step proved, or a quiet pending label.
//
// The receipt is the point of the design: a finished step leaves the FACT it
// established on screen ("Email · p•••••h@gmail.com"), which is what lets the
// flow delete its Back button — `Change` lives here, permanently visible,
// rather than in a control that only exists on one screen.

export type StepState = 'pending' | 'active' | 'done';

export function LedgerStep({
  index,
  state,
  isLast,
  headingId,
  pendingLabel,
  title,
  subtitle,
  summaryLabel,
  summaryValue,
  onChange,
  changeLabel,
  children,
}: {
  index: number;
  state: StepState;
  isLast?: boolean;
  headingId: string;
  /** shown while the step is out of reach */
  pendingLabel: string;
  title: string;
  subtitle?: string;
  /** the receipt, once done */
  summaryLabel: string;
  summaryValue: string;
  /** omitted when the step is not editable (a verified code is not) */
  onChange?: () => void;
  changeLabel?: string;
  children?: ReactNode;
}) {
  return (
    <li className="relative grid grid-cols-[24px_1fr] gap-x-3 sm:grid-cols-[28px_1fr] sm:gap-x-4">
      {!isLast && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute bottom-[-24px] left-[11px] top-[34px] w-px transition-colors duration-[var(--duration-base)] ease-[var(--ease-out)] sm:left-[13px]',
            state === 'done' ? 'bg-[var(--color-accent-600)]' : 'bg-[var(--color-border)]',
          )}
        />
      )}

      <span
        aria-hidden="true"
        className={cn(
          'grid size-6 place-items-center rounded-[var(--radius-sm)] border text-xs font-semibold transition-colors duration-[var(--duration-base)] ease-[var(--ease-out)] sm:size-7',
          state === 'pending' &&
            // neutral-500 (4.75:1) — the marker's own boundary has to clear the
            // 3:1 non-text bar, and border-strong is only ~1.5:1.
            'border-[var(--color-neutral-500)] bg-[var(--color-bg-elevated)] text-[var(--color-fg-muted)]',
          state === 'active' &&
            'border-[var(--color-primary-600)] bg-[var(--color-primary-600)] text-white',
          state === 'done' &&
            'border-[var(--color-primary-600)] bg-[var(--color-primary-600)] text-[var(--color-accent-500)]',
        )}
      >
        {state === 'done' ? <Check className="size-3.5" /> : index}
      </span>

      <div className="pb-6">
        {state === 'pending' && (
          <p className="flex min-h-6 items-center text-sm font-medium text-[var(--color-fg-muted)] sm:min-h-7">
            {pendingLabel}
          </p>
        )}

        {state === 'done' && (
          <div className="flex min-h-6 items-center justify-between gap-3 sm:min-h-7">
            <p className="min-w-0 text-sm">
              <span className="sr-only">Completed: </span>
              <span className="text-[var(--color-fg-muted)]">{summaryLabel}</span>
              <span aria-hidden="true" className="text-[var(--color-fg-muted)]">
                {' · '}
              </span>
              <span className="font-medium text-[var(--color-fg)]" title={summaryValue}>
                {summaryValue}
              </span>
            </p>
            {onChange && (
              <button
                type="button"
                onClick={onChange}
                // min-h-11 (44px) with the negative margin absorbed back, so the
                // touch target clears the mobile floor without stretching the
                // 28px receipt row it sits in.
                className="-my-2.5 inline-flex min-h-11 shrink-0 items-center gap-1.5 px-1 text-sm text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
              >
                <Pencil aria-hidden="true" className="size-3" />
                {changeLabel ?? 'Change'}
              </button>
            )}
          </div>
        )}

        {state === 'active' && (
          <>
            <h2 id={headingId} className="text-base font-semibold text-[var(--color-fg)]">
              {title}
            </h2>
            {subtitle && <p className="mt-1 text-sm text-[var(--color-fg-muted)]">{subtitle}</p>}
            <section aria-labelledby={headingId} className="mt-5">
              {children}
            </section>
          </>
        )}
      </div>
    </li>
  );
}
