import { IndianRupee } from '@jobportal/ui/icons';
import { formatSalaryLpa } from '../job-list-format';

export interface SalaryCompensationCardProps {
  salaryMinPaise: number | null;
  salaryMaxPaise: number | null;
}

// §4 Salary & compensation. The Job model has no explicit "confidential" flag —
// a posting with no salary range set is treated as confidential/undisclosed and
// shows "As per industry standards" instead of figures (per the task spec).
// When a range exists it renders as ₹min–max LPA (formatSalaryLpa handles the
// min-only / max-only / crore shapes).
export function SalaryCompensationCard({
  salaryMinPaise,
  salaryMaxPaise,
}: SalaryCompensationCardProps) {
  const salary = formatSalaryLpa(salaryMinPaise, salaryMaxPaise);

  return (
    <section
      aria-labelledby="salary-heading"
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5"
    >
      <h2 id="salary-heading" className="mb-3 text-sm font-semibold text-[var(--color-fg)]">
        Salary &amp; compensation
      </h2>
      <div className="flex items-center gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--color-bg-muted)] text-[var(--color-fg-muted)]"
          aria-hidden="true"
        >
          <IndianRupee className="size-4" />
        </span>
        {salary ? (
          <div className="min-w-0">
            <p className="text-lg font-semibold text-[var(--color-fg)]">{salary}</p>
            <p className="text-xs text-[var(--color-fg-muted)]">Annual CTC range</p>
          </div>
        ) : (
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--color-fg)]">As per industry standards</p>
            <p className="text-xs text-[var(--color-fg-muted)]">Salary kept confidential</p>
          </div>
        )}
      </div>
    </section>
  );
}
