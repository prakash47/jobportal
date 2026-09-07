'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label, RadioGroup, RadioItem } from '@jobportal/ui';
import { EVENTS, track } from '../../lib/analytics/posthog';
import { MultiCombobox, type ComboboxOption } from '../ui/Combobox';
import {
  buildQuery,
  monthsToYears,
  paiseToLpa,
  saveAlert,
  type Frequency,
} from '../../lib/alerts/query';

export type { Frequency };

interface CatalogueEntry {
  slug: string;
  name: string;
  state?: string;
}

export interface AlertFormProps {
  // null when creating; existing row when editing.
  initial: {
    id: number | null;
    name: string;
    query: {
      q?: string;
      skillSlugs?: string[];
      citySlugs?: string[];
      minExperienceMonths?: number;
      maxExperienceMonths?: number;
      salaryMin?: number;
    };
    frequency: Frequency;
    isActive: boolean;
  };
  skillCatalogue: CatalogueEntry[];
  cityCatalogue: CatalogueEntry[];
}

function toOptions(entries: CatalogueEntry[]): ComboboxOption[] {
  return entries.map((e) => ({
    value: e.slug,
    label: e.name,
    ...(e.state ? { hint: e.state } : {}),
  }));
}

export function AlertForm({ initial, skillCatalogue, cityCatalogue }: AlertFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [q, setQ] = useState(initial.query.q ?? '');
  const [skillSlugs, setSkillSlugs] = useState<string[]>(initial.query.skillSlugs ?? []);
  const [citySlugs, setCitySlugs] = useState<string[]>(initial.query.citySlugs ?? []);
  const [minExpYears, setMinExpYears] = useState<number | ''>(
    monthsToYears(initial.query.minExperienceMonths),
  );
  const [maxExpYears, setMaxExpYears] = useState<number | ''>(
    monthsToYears(initial.query.maxExperienceMonths),
  );
  const [salaryMinLpa, setSalaryMinLpa] = useState<number | ''>(paiseToLpa(initial.query.salaryMin));
  const [frequency, setFrequency] = useState<Frequency>(initial.frequency);
  const [isActive, setIsActive] = useState(initial.isActive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const skillOptions = useMemo(() => toOptions(skillCatalogue), [skillCatalogue]);
  const cityOptions = useMemo(() => toOptions(cityCatalogue), [cityCatalogue]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const result = await saveAlert(initial.id, {
      name,
      query: buildQuery({ q, skillSlugs, citySlugs, minExpYears, maxExpYears, salaryMinLpa }),
      frequency,
      isActive,
    });
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    // Phase 1 item 18 — only fire on CREATE, not edit. The event is
    // about conversion (a new alert is a strong signal), not edits.
    if (initial.id === null) {
      track(EVENTS.JOB_ALERT_CREATED, { frequency });
    }
    router.push('/alerts');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="name">Alert name</Label>
        <p className="text-xs text-[var(--color-fg-muted)]">
          Only you see this — it labels the alert in your list and the email subject.
        </p>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
          placeholder="e.g. Frontend roles in Bengaluru"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="q">Search keywords</Label>
        <p className="text-xs text-[var(--color-fg-muted)]">
          Job titles or roles — matched as free text against the title and description.
        </p>
        <Input
          id="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={200}
          placeholder="e.g. frontend engineer"
        />
      </div>

      <MultiCombobox
        id="alert-skills"
        label="Skills"
        hint="Specific technical capabilities, picked from our catalogue. A job must list at least one of them."
        placeholder="Search skills…"
        options={skillOptions}
        selected={skillSlugs}
        onChange={setSkillSlugs}
        emptyLabel="No skill matches that name"
      />

      <MultiCombobox
        id="alert-cities"
        label="Cities"
        hint="Leave empty to match anywhere in India."
        placeholder="Search cities…"
        options={cityOptions}
        selected={citySlugs}
        onChange={setCitySlugs}
        emptyLabel="No city matches that name"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <NumberField
          id="minExpYears"
          label="Min experience (years)"
          value={minExpYears}
          onChange={setMinExpYears}
          min={0}
          max={60}
          step={0.5}
        />
        <NumberField
          id="maxExpYears"
          label="Max experience (years)"
          value={maxExpYears}
          onChange={setMaxExpYears}
          min={0}
          max={60}
          step={0.5}
        />
        <NumberField
          id="salaryMinLpa"
          label="Min salary (LPA)"
          value={salaryMinLpa}
          onChange={setSalaryMinLpa}
          min={0}
          step={0.5}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-[var(--color-fg)]">Frequency</legend>
        <RadioGroup
          value={frequency}
          onValueChange={(v) => setFrequency(v as Frequency)}
          className="flex flex-row flex-wrap gap-4"
        >
          {(['instant', 'daily', 'weekly'] as const).map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm text-[var(--color-fg)]">
              <RadioItem value={f} />
              <span className="capitalize">{f}</span>
            </label>
          ))}
        </RadioGroup>
      </fieldset>

      <div className="flex items-center gap-2">
        <input
          id="isActive"
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="size-4 rounded border-[var(--color-border)]"
        />
        <Label htmlFor="isActive" className="text-sm text-[var(--color-fg)]">
          Active
        </Label>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-border)] pt-6">
        <Button type="submit" loading={busy}>
          {initial.id === null ? 'Create alert' : 'Save changes'}
        </Button>
        {/*
          Discarding used to mean scrolling back up to the header's back link.
          `router.back()` is deliberately NOT used: arriving here from an email
          or a fresh tab would send the user out of the product entirely.
        */}
        <Button type="button" variant="ghost" onClick={() => router.push('/alerts')} disabled={busy}>
          Cancel
        </Button>
        {error && (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  id: string;
  label: string;
  value: number | '';
  onChange: (v: number | '') => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        {...(min !== undefined ? { min } : {})}
        {...(max !== undefined ? { max } : {})}
        {...(step !== undefined ? { step } : {})}
      />
    </div>
  );
}
