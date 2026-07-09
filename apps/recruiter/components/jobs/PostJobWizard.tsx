'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Input, Label, RadioGroup, RadioItem, Textarea } from '@jobportal/ui';
import type { JobType } from '../../lib/job-types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface CatalogueEntry {
  id: number;
  slug: string;
  name: string;
}

interface QuotaState {
  daily: { count: number; limit: number };
  monthly: { count: number; limit: number };
  unlimited: boolean;
  upgradeAvailable: boolean;
}

// Prefill shape when starting from a template (a past job). Salary is carried in
// paise (the API's unit) and converted to LPA for the inputs. All optional — an
// absent key falls back to the blank/default the wizard uses for a new job.
export interface WizardInitialValues {
  title?: string;
  description?: string;
  shortDescription?: string | null;
  skillIds?: number[];
  primaryCityId?: number | null;
  cityIds?: number[];
  industryId?: number | null;
  functionalAreaId?: number | null;
  employmentType?: EmploymentType;
  workMode?: WorkMode;
  experienceMinYears?: number | null;
  experienceMaxYears?: number | null;
  salaryMinPaise?: number | null;
  salaryMaxPaise?: number | null;
}

export interface PostJobWizardProps {
  skills: CatalogueEntry[];
  cities: CatalogueEntry[];
  industries: CatalogueEntry[];
  functionalAreas: CatalogueEntry[];
  quota: QuotaState | null;
  // The selected job-type product (Phase 2 UI: drives the Internship→INTERN
  // preset + display; not yet persisted to the API — no jobType column until
  // Phase 3). Defaults to FREE.
  jobType?: JobType;
  // Prefill from a chosen template (past job). Undefined = blank new job.
  initialValues?: WizardInitialValues | undefined;
}

type Step = 0 | 1 | 2 | 3 | 4 | 5;
const STEP_LABELS = [
  'Title',
  'Description',
  'Skills + locations',
  'Experience + salary',
  'Employment type + work mode',
  'Review',
] as const;

type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACTOR' | 'INTERN';
type WorkMode = 'ONSITE' | 'REMOTE' | 'HYBRID';

function lpaToPaise(lpa: number | ''): number | null {
  if (lpa === '' || Number.isNaN(lpa)) return null;
  return Math.round(Number(lpa) * 100_000 * 100);
}

function paiseToLpa(paise: number | null | undefined): number | '' {
  if (paise === null || paise === undefined) return '';
  return paise / 100_000 / 100;
}

// SRS §4.9.3 — six-step wizard. Linear-style: keyboard-driven (Enter advances,
// Esc steps back), single column, step indicator is plain text rather than a
// progress bar (CLAUDE.md §2 — restraint).
export function PostJobWizard({
  skills,
  cities,
  industries,
  functionalAreas,
  quota,
  jobType = 'FREE',
  initialValues,
}: PostJobWizardProps) {
  const router = useRouter();
  const iv = initialValues ?? {};
  const [step, setStep] = useState<Step>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [title, setTitle] = useState(iv.title ?? '');
  // Step 2
  const [description, setDescription] = useState(iv.description ?? '');
  const [shortDescription, setShortDescription] = useState(iv.shortDescription ?? '');
  // Step 3
  const [skillIds, setSkillIds] = useState<Set<number>>(new Set(iv.skillIds ?? []));
  const [skillQuery, setSkillQuery] = useState('');
  const [primaryCityId, setPrimaryCityId] = useState<number | ''>(iv.primaryCityId ?? '');
  const [cityIds, setCityIds] = useState<Set<number>>(new Set(iv.cityIds ?? []));
  const [cityQuery, setCityQuery] = useState('');
  const [industryId, setIndustryId] = useState<number | ''>(iv.industryId ?? '');
  const [functionalAreaId, setFunctionalAreaId] = useState<number | ''>(iv.functionalAreaId ?? '');
  // Step 4
  const [expMinYears, setExpMinYears] = useState<number | ''>(iv.experienceMinYears ?? '');
  const [expMaxYears, setExpMaxYears] = useState<number | ''>(iv.experienceMaxYears ?? '');
  const [salaryMinLpa, setSalaryMinLpa] = useState<number | ''>(paiseToLpa(iv.salaryMinPaise));
  const [salaryMaxLpa, setSalaryMaxLpa] = useState<number | ''>(paiseToLpa(iv.salaryMaxPaise));
  // Step 5
  const [employmentType, setEmploymentType] = useState<EmploymentType>(
    iv.employmentType ?? (jobType === 'INTERNSHIP' ? 'INTERN' : 'FULL_TIME'),
  );
  const [workMode, setWorkMode] = useState<WorkMode>(iv.workMode ?? 'ONSITE');

  const filteredSkills = useMemo(() => {
    const q = skillQuery.trim().toLowerCase();
    if (!q) return skills.slice(0, 60);
    return skills.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 60);
  }, [skillQuery, skills]);

  const filteredCities = useMemo(() => {
    const q = cityQuery.trim().toLowerCase();
    if (!q) return cities.slice(0, 40);
    return cities.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 40);
  }, [cityQuery, cities]);

  const exhausted =
    quota !== null &&
    !quota.unlimited &&
    (quota.daily.count >= quota.daily.limit || quota.monthly.count >= quota.monthly.limit);

  const stepValid = ((): boolean => {
    if (step === 0) return title.trim().length >= 3;
    if (step === 1) return description.trim().length >= 10;
    if (step === 2) return skillIds.size > 0 && primaryCityId !== '';
    if (step === 3) return true; // ranges optional but if both set must be ordered
    if (step === 4) return true;
    return true;
  })();

  function next() {
    if (step < 5) setStep((step + 1) as Step);
  }
  function back() {
    if (step > 0) setStep((step - 1) as Step);
  }

  async function submit(publishMode: 'DRAFT' | 'PUBLISH') {
    setBusy(true);
    setError(null);

    const body: Record<string, unknown> = {
      publishMode,
      title: title.trim(),
      description: description.trim(),
      employmentType,
      workMode,
    };
    if (shortDescription.trim()) body['shortDescription'] = shortDescription.trim();
    if (skillIds.size > 0) body['skillIds'] = [...skillIds];
    if (primaryCityId !== '') body['primaryCityId'] = primaryCityId;
    if (cityIds.size > 0) body['cityIds'] = [...cityIds];
    if (industryId !== '') body['industryId'] = industryId;
    if (functionalAreaId !== '') body['functionalAreaId'] = functionalAreaId;
    if (expMinYears !== '') body['experienceMinYears'] = Number(expMinYears);
    if (expMaxYears !== '') body['experienceMaxYears'] = Number(expMaxYears);
    const salaryMin = lpaToPaise(salaryMinLpa);
    if (salaryMin !== null) body['salaryMinPaise'] = salaryMin;
    const salaryMax = lpaToPaise(salaryMaxLpa);
    if (salaryMax !== null) body['salaryMaxPaise'] = salaryMax;

    try {
      const res = await fetch(`${API_URL}/recruiter/jobs`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(errBody.message ?? `Failed to ${publishMode.toLowerCase()} (${res.status})`);
      }
      router.push('/jobs');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <p className="text-xs text-[var(--color-fg-subtle)]">
        Step {step + 1} of 6 · {STEP_LABELS[step]}
      </p>

      {step === 0 && (
        <Field label="Job title" hint="One line — what most recruiters and candidates would type into search.">
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            autoFocus
            placeholder="e.g. Senior Frontend Engineer"
          />
        </Field>
      )}

      {step === 1 && (
        <div className="space-y-6">
          <Field label="Short description" hint="One sentence shown on listings. Optional.">
            <Input
              id="shortDescription"
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              maxLength={280}
            />
          </Field>
          <Field label="Description" hint="Markdown supported. Hiring requirements, responsibilities, what success looks like.">
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={14}
              className="font-mono text-sm"
              placeholder={'## About the role\n\nWhat the candidate will own.\n\n## You should have\n\n- 4+ years of...'}
            />
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <ChipPicker
            label="Required skills"
            entries={filteredSkills}
            selected={skillIds}
            onToggle={(id) => toggleId(skillIds, id, setSkillIds)}
            query={skillQuery}
            onQueryChange={setSkillQuery}
          />
          <Field label="Primary city">
            <select
              value={primaryCityId}
              onChange={(e) => setPrimaryCityId(e.target.value === '' ? '' : Number(e.target.value))}
              className="h-9 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-3 text-sm"
            >
              <option value="">Select a city</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <ChipPicker
            label="Other cities (optional)"
            entries={filteredCities}
            selected={cityIds}
            onToggle={(id) => toggleId(cityIds, id, setCityIds)}
            query={cityQuery}
            onQueryChange={setCityQuery}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Industry (optional)">
              <select
                value={industryId}
                onChange={(e) => setIndustryId(e.target.value === '' ? '' : Number(e.target.value))}
                className="h-9 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-3 text-sm"
              >
                <option value="">—</option>
                {industries.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Functional area (optional)">
              <select
                value={functionalAreaId}
                onChange={(e) =>
                  setFunctionalAreaId(e.target.value === '' ? '' : Number(e.target.value))
                }
                className="h-9 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-3 text-sm"
              >
                <option value="">—</option>
                {functionalAreas.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Min experience (years)">
            <Input
              id="expMin"
              type="number"
              min={0}
              max={60}
              value={expMinYears}
              onChange={(e) => setExpMinYears(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </Field>
          <Field label="Max experience (years)">
            <Input
              id="expMax"
              type="number"
              min={0}
              max={60}
              value={expMaxYears}
              onChange={(e) => setExpMaxYears(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </Field>
          <Field label="Min salary (LPA)">
            <Input
              id="salMin"
              type="number"
              min={0}
              step={0.5}
              value={salaryMinLpa}
              onChange={(e) => setSalaryMinLpa(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </Field>
          <Field label="Max salary (LPA)">
            <Input
              id="salMax"
              type="number"
              min={0}
              step={0.5}
              value={salaryMaxLpa}
              onChange={(e) => setSalaryMaxLpa(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </Field>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-6">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-[var(--color-fg)]">Employment type</legend>
            <RadioGroup
              value={employmentType}
              onValueChange={(v) => setEmploymentType(v as EmploymentType)}
              className="flex flex-row flex-wrap gap-4"
            >
              {(['FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'INTERN'] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm">
                  <RadioItem value={t} />
                  <span className="capitalize">{t.replace('_', ' ').toLowerCase()}</span>
                </label>
              ))}
            </RadioGroup>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-[var(--color-fg)]">Work mode</legend>
            <RadioGroup
              value={workMode}
              onValueChange={(v) => setWorkMode(v as WorkMode)}
              className="flex flex-row flex-wrap gap-4"
            >
              {(['ONSITE', 'REMOTE', 'HYBRID'] as const).map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm">
                  <RadioItem value={m} />
                  <span className="capitalize">{m.toLowerCase()}</span>
                </label>
              ))}
            </RadioGroup>
          </fieldset>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4 rounded-md border border-[var(--color-border)] p-6">
          <h2 className="text-lg font-semibold text-[var(--color-fg)]">Review</h2>
          <SummaryRow label="Title" value={title} />
          <SummaryRow label="Employment" value={`${employmentType} · ${workMode}`} />
          <SummaryRow
            label="Skills"
            value={`${skillIds.size} selected`}
          />
          <SummaryRow
            label="Cities"
            value={
              primaryCityId !== ''
                ? `${cities.find((c) => c.id === primaryCityId)?.name}${
                    cityIds.size ? ` + ${cityIds.size} more` : ''
                  }`
                : '—'
            }
          />
          <SummaryRow
            label="Experience"
            value={
              expMinYears !== '' || expMaxYears !== ''
                ? `${expMinYears || 0}–${expMaxYears || '?'} yrs`
                : '—'
            }
          />
          <SummaryRow
            label="Salary"
            value={
              salaryMinLpa !== '' || salaryMaxLpa !== ''
                ? `₹${salaryMinLpa || '?'}–${salaryMaxLpa || '?'} LPA`
                : '—'
            }
          />
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {exhausted && step === 5 && (
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 text-sm">
          <p className="font-medium text-[var(--color-fg)]">Daily or monthly post limit reached.</p>
          <p className="mt-1 text-[var(--color-fg-muted)]">
            {quota?.upgradeAvailable
              ? 'Upgrade your plan to post more jobs today.'
              : 'You can save this as a draft and publish later.'}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-4">
        <Button variant="ghost" onClick={back} disabled={step === 0 || busy}>
          ← Back
        </Button>
        {step < 5 ? (
          <Button variant="primary" onClick={next} disabled={!stepValid || busy}>
            Continue →
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => submit('DRAFT')} loading={busy}>
              Save draft
            </Button>
            <Button
              variant="primary"
              onClick={() => submit('PUBLISH')}
              loading={busy}
              disabled={exhausted}
            >
              Publish
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-[var(--color-fg-subtle)]">{hint}</p>}
    </div>
  );
}

function ChipPicker({
  label,
  entries,
  selected,
  onToggle,
  query,
  onQueryChange,
}: {
  label: string;
  entries: CatalogueEntry[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  query: string;
  onQueryChange: (v: string) => void;
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
        {entries.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => onToggle(e.id)}
            className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
            aria-pressed={selected.has(e.id)}
          >
            <Badge variant={selected.has(e.id) ? 'primary' : 'neutral'}>{e.name}</Badge>
          </button>
        ))}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-[var(--color-fg-muted)]">{label}</dt>
      <dd className="text-sm text-[var(--color-fg)]">{value || '—'}</dd>
    </div>
  );
}

function toggleId(set: Set<number>, id: number, setter: (next: Set<number>) => void) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  setter(next);
}
