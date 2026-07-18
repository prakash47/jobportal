import type { ReactNode } from 'react';
import { Badge } from '@jobportal/ui';
import { Briefcase, Building2, Clock, GraduationCap, Sparkles } from '@jobportal/ui/icons';
import {
  EMPLOYMENT_LABELS,
  formatExperienceYears,
  type EmploymentType,
} from '../job-list-format';

export interface CandidateRequirementsCardProps {
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  employmentType: EmploymentType;
  departmentName: string | null;
  qualifications: string | null;
  internshipDurationMonths: number | null;
  skillNames: string[];
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

// §3 Candidate requirements — the structured criteria set during job creation:
// experience range, education, job type, department, and key skills. Only rows
// with data render (a sparse posting stays clean, no "—" placeholders per
// CLAUDE.md §2). Job type always renders (it always has a value).
export function CandidateRequirementsCard({
  experienceMinYears,
  experienceMaxYears,
  employmentType,
  departmentName,
  qualifications,
  internshipDurationMonths,
  skillNames,
}: CandidateRequirementsCardProps) {
  const experience = formatExperienceYears(experienceMinYears, experienceMaxYears);

  return (
    <section
      aria-labelledby="candidate-requirements-heading"
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 sm:p-6"
    >
      <h2
        id="candidate-requirements-heading"
        className="mb-4 text-sm font-semibold text-[var(--color-fg)]"
      >
        Candidate requirements
      </h2>

      <div className="divide-y divide-[var(--color-border)]">
        {experience && (
          <Row icon={<Briefcase className="size-4" />} label="Experience" value={experience} />
        )}
        <Row
          icon={<Clock className="size-4" />}
          label="Job type"
          value={EMPLOYMENT_LABELS[employmentType]}
        />
        {internshipDurationMonths != null && internshipDurationMonths > 0 && (
          <Row
            icon={<Clock className="size-4" />}
            label="Internship duration"
            value={`${internshipDurationMonths} ${internshipDurationMonths === 1 ? 'month' : 'months'}`}
          />
        )}
        {departmentName && (
          <Row icon={<Building2 className="size-4" />} label="Department" value={departmentName} />
        )}
        {qualifications && (
          <Row
            icon={<GraduationCap className="size-4" />}
            label="Education"
            value={qualifications}
          />
        )}
      </div>

      <div className="mt-4 border-t border-[var(--color-border)] pt-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--color-fg)]">
          <Sparkles className="size-4 text-[var(--color-fg-muted)]" aria-hidden="true" />
          Key skills
        </div>
        {skillNames.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {skillNames.map((s) => (
              <Badge key={s} variant="neutral">
                {s}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--color-fg-muted)]">No specific skills listed.</p>
        )}
      </div>
    </section>
  );
}
