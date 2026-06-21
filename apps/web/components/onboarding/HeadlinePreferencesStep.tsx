'use client';

import { Input, Label, Textarea } from '@jobportal/ui';
import { Check } from '@jobportal/ui/icons';
import { SegmentedControl } from './SegmentedControl';
import { ChipMultiSelect, type ChipOption } from './ChipMultiSelect';

const HEADLINE_MAX = 250;

const GENDERS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
] as const;

// Scalar state for this step, owned by the wizard. positionRole maps to
// Candidate.currentTitle; salary is annual rupees (raw text).
export interface HeadlinePrefsValue {
  headline: string;
  positionRole: string;
  salary: string;
  gender: string | null;
}

// The final "Headline & preferences" onboarding step. Resume headline, a
// highlighted role, preferred work locations, preferred salary, and gender.
// Presentational + controlled; flat brand styling.
export function HeadlinePreferencesStep({
  value,
  onChange,
  cityOptions,
  cityIds,
  onCityIdsChange,
}: {
  value: HeadlinePrefsValue;
  onChange: (patch: Partial<HeadlinePrefsValue>) => void;
  cityOptions: ChipOption[];
  cityIds: number[];
  onCityIdsChange: (ids: number[]) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Resume headline */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="hp-headline">Resume headline</Label>
            {value.headline.trim() !== '' && (
              <Check className="size-4 text-[var(--color-success)]" aria-hidden="true" />
            )}
          </div>
          <span className="text-xs text-[var(--color-fg-muted)]">
            {value.headline.length}/{HEADLINE_MAX}
          </span>
        </div>
        <Textarea
          id="hp-headline"
          value={value.headline}
          onChange={(e) => onChange({ headline: e.target.value.slice(0, HEADLINE_MAX) })}
          maxLength={HEADLINE_MAX}
          rows={3}
          placeholder="e.g. Full Stack Developer with 2.5 years of experience building scalable web applications with React and Node.js."
        />
      </div>

      {/* Position / Role */}
      <div className="space-y-1.5">
        <Label htmlFor="hp-role">
          Position / Role <span className="font-normal text-[var(--color-fg-muted)]">(optional)</span>
        </Label>
        <Input
          id="hp-role"
          value={value.positionRole}
          onChange={(e) => onChange({ positionRole: e.target.value })}
          maxLength={120}
          placeholder="e.g. Full Stack, Frontend, Marketing…"
        />
        <p className="text-xs text-[var(--color-fg-muted)]">This will be highlighted on your profile.</p>
      </div>

      {/* Preferred work locations */}
      <div className="space-y-2">
        <Label>Preferred work locations</Label>
        <ChipMultiSelect
          options={cityOptions}
          selected={cityIds}
          onChange={onCityIdsChange}
          max={10}
          searchPlaceholder="Add location…"
        />
      </div>

      {/* Preferred salary */}
      <div className="space-y-1.5">
        <Label htmlFor="hp-salary">Preferred salary</Label>
        <div className="flex">
          <span className="inline-flex items-center rounded-l-md border border-r-0 border-[var(--color-border-strong)] bg-[var(--color-bg-muted)] px-3 text-sm text-[var(--color-fg-muted)]">
            ₹
          </span>
          <Input
            id="hp-salary"
            type="text"
            inputMode="numeric"
            value={value.salary}
            // Digits only; type="text" so a stray wheel/arrow can't mutate it.
            onChange={(e) => onChange({ salary: e.target.value.replace(/\D/g, '') })}
            placeholder="e.g. 500000"
            className="flex-1 rounded-none"
          />
          <span className="inline-flex items-center whitespace-nowrap rounded-r-md border border-l-0 border-[var(--color-border-strong)] bg-[var(--color-bg-muted)] px-3 text-sm text-[var(--color-fg-muted)]">
            per year
          </span>
        </div>
      </div>

      {/* Gender */}
      <div className="space-y-1.5">
        <Label>Gender</Label>
        <SegmentedControl
          options={GENDERS}
          value={value.gender}
          onChange={(v) => onChange({ gender: v })}
          ariaLabel="Gender"
        />
      </div>
    </div>
  );
}
