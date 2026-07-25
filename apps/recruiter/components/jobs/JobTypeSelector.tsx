'use client';

import { Badge, Button, cn } from '@jobportal/ui';
import { JOB_TYPES, type JobType } from '../../lib/job-types';

interface JobTypeSelectorProps {
  /** Whether each type is currently selectable (paid types gated by flags). */
  availability: Record<JobType, boolean>;
  onSelect: (type: JobType) => void;
  onBack: () => void;
}

// Naukri-style product selector, re-styled to our Linear/Stripe minimal look:
// bordered cards, one accent on the recommended card, no gradients/badges-shouting.
// Free + Internship are always selectable; Hot Vacancy + SMB render locked
// ("Upgrade") when their flag is OFF (Day-0 freemium state).
export function JobTypeSelector({ availability, onSelect, onBack }: JobTypeSelectorProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-[var(--color-fg)]">
          Choose a job type
        </h2>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Pick how this role should be posted. You can change most details on the next step.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {JOB_TYPES.map((meta) => {
          const available = availability[meta.type];
          return (
            <div
              key={meta.type}
              className={cn(
                'flex flex-col rounded-lg border p-5 transition-colors',
                // Cards sit on the muted canvas, so an available card is an
                // elevated white surface; an unavailable one is the same card
                // held back to a translucent fill so it reads as dimmed.
                available
                  ? 'border-[var(--color-border)] bg-[var(--color-bg-elevated)]'
                  : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)]/50',
                meta.recommended && available && 'border-[var(--color-primary-600)]',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--color-fg)]">{meta.label}</h3>
                {meta.recommended && available ? (
                  <Badge variant="primary">Recommended</Badge>
                ) : !available ? (
                  <Badge variant="neutral">Upgrade</Badge>
                ) : null}
              </div>

              <p className="mt-1.5 text-sm text-[var(--color-fg-muted)]">{meta.tagline}</p>

              <ul className="mt-3 space-y-1 text-xs text-[var(--color-fg-muted)]">
                {meta.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5">
                    <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--color-fg-subtle)]" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 pt-1">
                {available ? (
                  <Button
                    variant={meta.recommended ? 'primary' : 'secondary'}
                    onClick={() => onSelect(meta.type)}
                    className="w-full"
                  >
                    Select {meta.label}
                  </Button>
                ) : (
                  <p className="text-xs text-[var(--color-fg-subtle)]">
                    Available on a paid plan — contact us to enable it for your company.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-[var(--color-border)] pt-4">
        <Button variant="ghost" onClick={onBack}>
          ← Back
        </Button>
      </div>
    </div>
  );
}
