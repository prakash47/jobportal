'use client';

import { type ReactNode } from 'react';
import { Input, Label } from '@jobportal/ui';
import { SegmentedControl } from './SegmentedControl';
import { FieldSelect } from './FieldSelect';
import { SkillAutocomplete, type SelectedSkill, type SkillCatalogueItem } from './SkillAutocomplete';
import { ProjectsEditor, type ProjectItem } from './ProjectsEditor';
import { LanguagesEditor, type LanguageItem } from './LanguagesEditor';
import { CitySelect } from './CitySelect';
import { formatINR } from './format';

const WORK_STATUS = [
  { value: 'FRESHER', label: 'Fresher' },
  { value: 'EXPERIENCED', label: 'Experienced' },
] as const;

const LOOKING_FOR = [
  { value: 'JOB', label: 'Job' },
  { value: 'INTERNSHIP', label: 'Internship' },
  { value: 'BOTH', label: 'Both' },
] as const;

// Notice-period options map to noticePeriodDays on save. Exported so the wizard
// can coerce an out-of-set stored value to the placeholder (avoids a silently
// blank native <select>).
export const NOTICE_PERIODS = [
  { value: '0', label: 'Immediate' },
  { value: '15', label: '15 days' },
  { value: '30', label: '1 month' },
  { value: '60', label: '2 months' },
  { value: '90', label: '3 months' },
  { value: '120', label: 'More than 3 months' },
] as const;

const EXPERIENCE_YEARS = Array.from({ length: 41 }, (_, i) => i); // 0–40
const EXPERIENCE_MONTHS = Array.from({ length: 12 }, (_, i) => i); // 0–11

// The scalar state for this step, owned by the wizard so saveStep can read it.
export interface EmploymentValue {
  workStatus: string | null;
  lookingFor: string | null;
  expYears: string;
  expMonths: string;
  salary: string; // annual rupees, raw text
  company: string;
  designation: string;
  city: string;
  industryId: string; // '' = none
  noticePeriod: string; // '' = none
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="size-1.5 rounded-full bg-[var(--color-accent-500)]" aria-hidden="true" />
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
        {children}
      </h2>
    </div>
  );
}

// The "Employment & professional details" onboarding step. Presentational +
// controlled: all scalar state lives in the wizard; projects/languages lists are
// controlled too (they persist immediately to the API but the wizard holds the
// list so it survives this subtree's remount on step navigation).
export function EmploymentStep({
  value,
  onChange,
  skills,
  skillSelection,
  onSkillsChange,
  industries,
  cities,
  projects,
  onProjectsChange,
  languages,
  onLanguagesChange,
}: {
  value: EmploymentValue;
  onChange: (patch: Partial<EmploymentValue>) => void;
  skills: SkillCatalogueItem[];
  skillSelection: SelectedSkill[];
  onSkillsChange: (next: SelectedSkill[]) => void;
  industries: { id: number; name: string }[];
  cities: { id: number; name: string; state: string }[];
  projects: ProjectItem[];
  onProjectsChange: (next: ProjectItem[]) => void;
  languages: LanguageItem[];
  onLanguagesChange: (next: LanguageItem[]) => void;
}) {
  const experienced = value.workStatus === 'EXPERIENCED';

  return (
    <div className="space-y-7">
      <section className="space-y-4">
        <SectionHeading>Professional status</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Work status</Label>
            <SegmentedControl
              options={WORK_STATUS}
              value={value.workStatus}
              onChange={(v) => onChange({ workStatus: v })}
              ariaLabel="Work status"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Looking for</Label>
            <SegmentedControl
              options={LOOKING_FOR}
              value={value.lookingFor}
              onChange={(v) => onChange({ lookingFor: v })}
              ariaLabel="Looking for"
            />
          </div>
        </div>
      </section>

      {experienced && (
        <section className="space-y-4">
          <SectionHeading>Work experience</SectionHeading>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="emp-years">Total experience</Label>
              <div className="grid grid-cols-2 gap-2">
                <FieldSelect
                  id="emp-years"
                  aria-label="Years of experience"
                  value={value.expYears}
                  onChange={(e) => onChange({ expYears: e.target.value })}
                >
                  {EXPERIENCE_YEARS.map((y) => (
                    <option key={y} value={String(y)}>
                      {y} {y === 1 ? 'Year' : 'Years'}
                    </option>
                  ))}
                </FieldSelect>
                <FieldSelect
                  aria-label="Months of experience"
                  value={value.expMonths}
                  onChange={(e) => onChange({ expMonths: e.target.value })}
                >
                  {EXPERIENCE_MONTHS.map((m) => (
                    <option key={m} value={String(m)}>
                      {m} {m === 1 ? 'Month' : 'Months'}
                    </option>
                  ))}
                </FieldSelect>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="emp-salary">Current salary (annual)</Label>
              <div className="relative">
                <span
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-fg-muted)]"
                  aria-hidden="true"
                >
                  ₹
                </span>
                <Input
                  id="emp-salary"
                  type="text"
                  inputMode="numeric"
                  // Display Indian-grouped (8,00,000), keep state as raw digits.
                  // type="text" so a stray wheel/arrow can't silently mutate it.
                  value={formatINR(value.salary)}
                  onChange={(e) => onChange({ salary: e.target.value.replace(/\D/g, '') })}
                  placeholder="e.g. 8,00,000"
                  className="pl-7"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="emp-company">Current company</Label>
              <Input
                id="emp-company"
                value={value.company}
                onChange={(e) => onChange({ company: e.target.value })}
                maxLength={150}
                placeholder="e.g. Google"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="emp-desg">Designation</Label>
              <Input
                id="emp-desg"
                value={value.designation}
                onChange={(e) => onChange({ designation: e.target.value })}
                maxLength={120}
                placeholder="e.g. Senior Developer"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="emp-city">Current city</Label>
              <CitySelect cities={cities} value={value.city} onChange={(city) => onChange({ city })} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="emp-industry">Industry</Label>
              <FieldSelect
                id="emp-industry"
                value={value.industryId}
                onChange={(e) => onChange({ industryId: e.target.value })}
              >
                <option value="">Select industry</option>
                {industries.map((i) => (
                  <option key={i.id} value={String(i.id)}>
                    {i.name}
                  </option>
                ))}
              </FieldSelect>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="emp-notice">Notice period</Label>
              <div className="sm:max-w-[calc(50%-0.5rem)]">
                <FieldSelect
                  id="emp-notice"
                  value={value.noticePeriod}
                  onChange={(e) => onChange({ noticePeriod: e.target.value })}
                >
                  <option value="">Select notice period</option>
                  {NOTICE_PERIODS.map((n) => (
                    <option key={n.value} value={n.value}>
                      {n.label}
                    </option>
                  ))}
                </FieldSelect>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <SectionHeading>Skills</SectionHeading>
        <SkillAutocomplete catalogue={skills} value={skillSelection} onChange={onSkillsChange} max={50} />
      </section>

      <section className="space-y-3">
        <SectionHeading>Projects</SectionHeading>
        <ProjectsEditor items={projects} onItemsChange={onProjectsChange} />
      </section>

      <section className="space-y-3">
        <SectionHeading>Languages</SectionHeading>
        <LanguagesEditor items={languages} onItemsChange={onLanguagesChange} />
      </section>
    </div>
  );
}
