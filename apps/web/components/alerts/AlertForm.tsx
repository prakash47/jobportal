'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Input, Label, RadioGroup, RadioItem } from '@jobportal/ui';
import { EVENTS, track } from '../../lib/analytics/posthog';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type Frequency = 'instant' | 'daily' | 'weekly';

interface CatalogueEntry {
  slug: string;
  name: string;
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

export function AlertForm({ initial, skillCatalogue, cityCatalogue }: AlertFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [q, setQ] = useState(initial.query.q ?? '');
  const [skillSlugs, setSkillSlugs] = useState<Set<string>>(
    new Set(initial.query.skillSlugs ?? []),
  );
  const [citySlugs, setCitySlugs] = useState<Set<string>>(new Set(initial.query.citySlugs ?? []));
  const [skillQuery, setSkillQuery] = useState('');
  const [cityQuery, setCityQuery] = useState('');
  const [minExpYears, setMinExpYears] = useState<number | ''>(
    initial.query.minExperienceMonths !== undefined
      ? Math.round(initial.query.minExperienceMonths / 12)
      : '',
  );
  const [maxExpYears, setMaxExpYears] = useState<number | ''>(
    initial.query.maxExperienceMonths !== undefined
      ? Math.round(initial.query.maxExperienceMonths / 12)
      : '',
  );
  const [salaryMinLpa, setSalaryMinLpa] = useState<number | ''>(
    initial.query.salaryMin !== undefined
      ? Math.round((initial.query.salaryMin / 100 / 100_000) * 10) / 10
      : '',
  );
  const [frequency, setFrequency] = useState<Frequency>(initial.frequency);
  const [isActive, setIsActive] = useState(initial.isActive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const skillFiltered = useMemo(() => {
    const q = skillQuery.trim().toLowerCase();
    if (!q) return skillCatalogue.slice(0, 60);
    return skillCatalogue.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 60);
  }, [skillQuery, skillCatalogue]);

  const cityFiltered = useMemo(() => {
    const q = cityQuery.trim().toLowerCase();
    if (!q) return cityCatalogue.slice(0, 30);
    return cityCatalogue.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 30);
  }, [cityQuery, cityCatalogue]);

  function toggleSkill(slug: string) {
    const next = new Set(skillSlugs);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setSkillSlugs(next);
  }

  function toggleCity(slug: string) {
    const next = new Set(citySlugs);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setCitySlugs(next);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const query: Record<string, unknown> = {};
    if (q) query['q'] = q;
    if (skillSlugs.size > 0) query['skillSlugs'] = [...skillSlugs];
    if (citySlugs.size > 0) query['citySlugs'] = [...citySlugs];
    if (minExpYears !== '') query['minExperienceMonths'] = Math.round(Number(minExpYears) * 12);
    if (maxExpYears !== '') query['maxExperienceMonths'] = Math.round(Number(maxExpYears) * 12);
    if (salaryMinLpa !== '') query['salaryMin'] = Math.round(Number(salaryMinLpa) * 100_000 * 100);

    const payload = { name, query, frequency, isActive };
    const url = initial.id ? `${API_URL}/me/alerts/${initial.id}` : `${API_URL}/me/alerts`;
    const method = initial.id ? 'PATCH' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Save failed (${res.status})`);
      }
      // Phase 1 item 18 — only fire on CREATE, not edit. The event is
      // about conversion (a new alert is a strong signal), not edits.
      if (!initial.id) {
        track(EVENTS.JOB_ALERT_CREATED, { frequency });
      }
      router.push('/alerts');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="name">Alert name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="q">Search keywords</Label>
        <Input
          id="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={200}
          placeholder="e.g. react frontend"
        />
      </div>

      <ChipPicker
        label="Skills"
        catalogue={skillFiltered}
        selected={skillSlugs}
        onToggle={toggleSkill}
        onQueryChange={setSkillQuery}
        query={skillQuery}
      />
      <ChipPicker
        label="Cities"
        catalogue={cityFiltered}
        selected={citySlugs}
        onToggle={toggleCity}
        onQueryChange={setCityQuery}
        query={cityQuery}
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

      <div className="flex items-center gap-3 border-t border-[var(--color-border)] pt-6">
        <Button type="submit" loading={busy}>
          {initial.id ? 'Save changes' : 'Create alert'}
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

function ChipPicker({
  label,
  catalogue,
  selected,
  query,
  onQueryChange,
  onToggle,
}: {
  label: string;
  catalogue: CatalogueEntry[];
  selected: Set<string>;
  query: string;
  onQueryChange: (v: string) => void;
  onToggle: (slug: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={`Search ${label.toLowerCase()}…`}
      />
      <div className="flex flex-wrap gap-1.5">
        {catalogue.map((entry) => (
          <button
            key={entry.slug}
            type="button"
            onClick={() => onToggle(entry.slug)}
            className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
            aria-pressed={selected.has(entry.slug)}
          >
            <Badge variant={selected.has(entry.slug) ? 'primary' : 'neutral'}>{entry.name}</Badge>
          </button>
        ))}
      </div>
    </div>
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
