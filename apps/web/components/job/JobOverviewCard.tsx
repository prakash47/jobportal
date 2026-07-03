import type { ReactNode } from 'react';
import { Briefcase, Building2, Clock, IndianRupee, MapPin } from '@jobportal/ui/icons';
import {
  EMPLOYMENT_LABELS,
  WORK_MODE_LABELS,
  formatExperienceYears,
  formatSalaryLpa,
} from '../../lib/job/format';

export interface JobOverviewCardProps {
  cityNames: string[];
  salaryMinPaise: number | null;
  salaryMaxPaise: number | null;
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  employmentType: string;
  workMode: string;
}

function Row({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <span className="mt-0.5 shrink-0 text-[var(--color-fg-muted)]" aria-hidden="true">
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
        <span className="shrink-0 text-sm text-[var(--color-fg-muted)]">{label}</span>
        <span className="text-right text-sm font-medium text-[var(--color-fg)]">{value}</span>
      </div>
    </div>
  );
}

// Left-rail "at a glance" facts card. Only rows with data render, so a sparse
// posting stays clean rather than showing "—" placeholders (CLAUDE.md §2).
export function JobOverviewCard({
  cityNames,
  salaryMinPaise,
  salaryMaxPaise,
  experienceMinYears,
  experienceMaxYears,
  employmentType,
  workMode,
}: JobOverviewCardProps) {
  const salary = formatSalaryLpa(salaryMinPaise, salaryMaxPaise);
  const exp = formatExperienceYears(experienceMinYears, experienceMaxYears);
  const location = cityNames.length > 0 ? cityNames.join(', ') : null;

  return (
    <section
      aria-label="Job overview"
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5"
    >
      <h2 className="mb-3 text-sm font-semibold text-[var(--color-fg)]">Job overview</h2>
      <div className="divide-y divide-[var(--color-border)]">
        {location && <Row icon={<MapPin className="size-4" />} label="Location" value={location} />}
        {exp && <Row icon={<Briefcase className="size-4" />} label="Experience" value={exp} />}
        {salary && <Row icon={<IndianRupee className="size-4" />} label="Salary" value={salary} />}
        <Row
          icon={<Clock className="size-4" />}
          label="Job type"
          value={EMPLOYMENT_LABELS[employmentType] ?? employmentType}
        />
        <Row
          icon={<Building2 className="size-4" />}
          label="Work mode"
          value={WORK_MODE_LABELS[workMode] ?? workMode}
        />
      </div>
    </section>
  );
}
