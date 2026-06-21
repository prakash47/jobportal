'use client';

import { Checkbox, Input, Label } from '@jobportal/ui';
import { FieldSelect } from './FieldSelect';
import { SectionHeading } from './EmploymentStep';

// One education section's editable state, owned by the wizard. `degree` is the
// user-entered degree name for the first-degree section; it's unused (fixed to a
// sentinel on save) for the Class 12 section. `pursuing` ⇔ endYear is null.
export interface EduSection {
  id: number | null;
  institute: string;
  degree: string;
  fieldOfStudy: string;
  startYear: string;
  endYear: string;
  grade: string;
  pursuing: boolean;
}

export const emptyEduSection: EduSection = {
  id: null,
  institute: '',
  degree: '',
  fieldOfStudy: '',
  startYear: '',
  endYear: '',
  grade: '',
  pursuing: false,
};

function YearSelect({
  id,
  ariaLabel,
  value,
  onChange,
  years,
  disabled,
}: {
  id?: string;
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  years: number[];
  disabled?: boolean;
}) {
  // Guarantee the controlled value always has a matching <option>: a year stored
  // elsewhere (e.g. the profile editor allows 1950–2100) could fall outside the
  // rendered range, which would otherwise render a silently-blank select.
  const numValue = value !== '' ? Number(value) : null;
  const renderedYears = numValue != null && !years.includes(numValue) ? [numValue, ...years] : years;
  return (
    <FieldSelect
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    >
      <option value="">Year</option>
      {renderedYears.map((y) => (
        <option key={y} value={String(y)}>
          {y}
        </option>
      ))}
    </FieldSelect>
  );
}

function PursuingToggle({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(c) => onChange(c === true)} />
      <Label htmlFor={id} className="cursor-pointer text-sm font-normal text-[var(--color-fg-muted)]">
        Currently pursuing
      </Label>
    </div>
  );
}

// The "Education details" onboarding step. Two fixed sections — First degree and
// Class 12 — each mapping to one Education row (POST/PATCH /me/education on
// Continue). Controlled: state lives in the wizard so it survives remount on nav.
export function EducationStep({
  currentYear,
  degree,
  onDegreeChange,
  class12,
  onClass12Change,
}: {
  currentYear: number;
  degree: EduSection;
  onDegreeChange: (patch: Partial<EduSection>) => void;
  class12: EduSection;
  onClass12Change: (patch: Partial<EduSection>) => void;
}) {
  // Newest first; allow a few future years for expected graduation dates, down
  // to 1950 to match the API's accepted year range.
  const years: number[] = [];
  for (let y = currentYear + 6; y >= 1950; y--) years.push(y);

  return (
    <div className="space-y-7">
      <section className="space-y-4">
        <SectionHeading>First degree information</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="deg-name">Degree name</Label>
            <Input
              id="deg-name"
              value={degree.degree}
              onChange={(e) => onDegreeChange({ degree: e.target.value })}
              maxLength={120}
              placeholder="e.g. B.Tech, B.Sc"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="deg-spec">Specialization</Label>
            <Input
              id="deg-spec"
              value={degree.fieldOfStudy}
              onChange={(e) => onDegreeChange({ fieldOfStudy: e.target.value })}
              maxLength={120}
              placeholder="e.g. Computer Science"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="deg-college">College name</Label>
          <Input
            id="deg-college"
            value={degree.institute}
            onChange={(e) => onDegreeChange({ institute: e.target.value })}
            maxLength={200}
            placeholder="e.g. IIT Bombay"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="deg-start">Starting year</Label>
            <YearSelect
              id="deg-start"
              ariaLabel="Degree starting year"
              value={degree.startYear}
              onChange={(v) => onDegreeChange({ startYear: v })}
              years={years}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="deg-end">Ending year</Label>
            <YearSelect
              id="deg-end"
              ariaLabel="Degree ending year"
              value={degree.pursuing ? '' : degree.endYear}
              onChange={(v) => onDegreeChange({ endYear: v })}
              years={years}
              disabled={degree.pursuing}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="deg-cgpa">CGPA / Percentage</Label>
            <Input
              id="deg-cgpa"
              value={degree.grade}
              onChange={(e) => onDegreeChange({ grade: e.target.value })}
              maxLength={40}
              placeholder="e.g. 8.5"
            />
          </div>
        </div>
        <PursuingToggle
          id="deg-pursuing"
          checked={degree.pursuing}
          onChange={(c) => onDegreeChange({ pursuing: c })}
        />
      </section>

      <div className="border-t border-[var(--color-border)]" />

      <section className="space-y-4">
        <SectionHeading>Class 12 information</SectionHeading>
        <div className="space-y-1.5">
          <Label htmlFor="c12-school">School / College name</Label>
          <Input
            id="c12-school"
            value={class12.institute}
            onChange={(e) => onClass12Change({ institute: e.target.value })}
            maxLength={200}
            placeholder="e.g. Delhi Public School"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c12-stream">Specialization / Stream</Label>
          <Input
            id="c12-stream"
            value={class12.fieldOfStudy}
            onChange={(e) => onClass12Change({ fieldOfStudy: e.target.value })}
            maxLength={120}
            placeholder="e.g. Science (PCM)"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="c12-start">Starting year</Label>
            <YearSelect
              id="c12-start"
              ariaLabel="Class 12 starting year"
              value={class12.startYear}
              onChange={(v) => onClass12Change({ startYear: v })}
              years={years}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c12-end">Ending year</Label>
            <YearSelect
              id="c12-end"
              ariaLabel="Class 12 ending year"
              value={class12.pursuing ? '' : class12.endYear}
              onChange={(v) => onClass12Change({ endYear: v })}
              years={years}
              disabled={class12.pursuing}
            />
          </div>
        </div>
        <PursuingToggle
          id="c12-pursuing"
          checked={class12.pursuing}
          onChange={(c) => onClass12Change({ pursuing: c })}
        />
      </section>
    </div>
  );
}
