'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label, Textarea, cn } from '@jobportal/ui';
import { api } from '../../lib/profile/api-client';

type WorkStatus = 'FRESHER' | 'EXPERIENCED';

// Stored in paise (1 INR = 100 paise) so we never round at the boundary.
// The form takes lakhs-per-annum (LPA) as the human-friendly input and we
// convert at submission time.
function lpaToPaise(lpa: number | ''): number | null {
  if (lpa === '' || Number.isNaN(lpa)) return null;
  return Math.round(Number(lpa) * 100_000 * 100);
}

function paiseToLpa(paise: number | null): number | '' {
  if (paise === null) return '';
  return Math.round((paise / 100 / 100_000) * 100) / 100;
}

export interface ProfileFormProps {
  initial: {
    name: string;
    phone: string | null;
    headline: string | null;
    summary: string | null;
    workStatus: WorkStatus | null;
    experienceMonths: number | null;
    currentTitle: string | null;
    currentSalaryPaise: number | null;
    expectedSalaryMinPaise: number | null;
    expectedSalaryMaxPaise: number | null;
    noticePeriodDays: number | null;
  };
}

export function ProfileForm({ initial }: ProfileFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone ?? '');
  const [headline, setHeadline] = useState(initial.headline ?? '');
  const [summary, setSummary] = useState(initial.summary ?? '');
  // "Working or fresher?" gate. New profiles default to Working so the work
  // fields are visible; a fresher flips it to hide them.
  const [workStatus, setWorkStatus] = useState<WorkStatus>(initial.workStatus ?? 'EXPERIENCED');
  const working = workStatus === 'EXPERIENCED';
  const [experienceYears, setExperienceYears] = useState<number | ''>(
    initial.experienceMonths !== null ? Math.round((initial.experienceMonths / 12) * 10) / 10 : '',
  );
  const [currentTitle, setCurrentTitle] = useState(initial.currentTitle ?? '');
  const [currentSalary, setCurrentSalary] = useState<number | ''>(paiseToLpa(initial.currentSalaryPaise));
  const [expectedMin, setExpectedMin] = useState<number | ''>(paiseToLpa(initial.expectedSalaryMinPaise));
  const [expectedMax, setExpectedMax] = useState<number | ''>(paiseToLpa(initial.expectedSalaryMaxPaise));
  const [notice, setNotice] = useState<number | ''>(initial.noticePeriodDays ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    const patch: Record<string, unknown> = { name, workStatus };
    if (phone) patch['phone'] = phone;
    if (headline) patch['headline'] = headline;
    if (summary) patch['summary'] = summary;
    // Work-history fields only apply to experienced candidates. When "Fresher"
    // is selected we omit them — the PATCH DTO can't clear to null, so any
    // previously-saved values simply stay hidden behind the FRESHER status.
    if (working) {
      if (experienceYears !== '') patch['experienceMonths'] = Math.round(Number(experienceYears) * 12);
      if (currentTitle) patch['currentTitle'] = currentTitle;
      const cs = lpaToPaise(currentSalary);
      if (cs !== null) patch['currentSalaryPaise'] = cs;
      const ex0 = lpaToPaise(expectedMin);
      if (ex0 !== null) patch['expectedSalaryMinPaise'] = ex0;
      const ex1 = lpaToPaise(expectedMax);
      if (ex1 !== null) patch['expectedSalaryMaxPaise'] = ex1;
      if (notice !== '') patch['noticePeriodDays'] = Number(notice);
    }

    const res = await api('/me/profile', { method: 'PATCH', body: JSON.stringify(patch) });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Field id="name" label="Name">
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
      </Field>
      <Field id="phone" label="Phone" hint="Optional. Recruiters won't see this until you apply.">
        <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
      </Field>
      <Field id="headline" label="Headline" hint="One line, e.g. 'Staff Engineer building dev tools'.">
        <Input id="headline" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={200} />
      </Field>
      <Field id="summary" label="Summary" hint="A few sentences about what you do.">
        <Textarea id="summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={5} maxLength={5000} />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-[var(--color-fg)]">
          Are you working or a fresher?
        </legend>
        <div
          role="radiogroup"
          aria-label="Are you working or a fresher?"
          className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-0.5"
        >
          {(
            [
              ['EXPERIENCED', 'Working'],
              ['FRESHER', 'Fresher'],
            ] as const
          ).map(([value, optionLabel]) => {
            const selected = workStatus === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setWorkStatus(value)}
                className={cn(
                  'rounded-md px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
                  selected
                    ? 'bg-[var(--color-primary-600)] text-white'
                    : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
                )}
              >
                {optionLabel}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-[var(--color-fg-muted)]">
          {working
            ? 'Add your current role, experience, and salary expectations below.'
            : "We'll list you as a fresher — no work history needed."}
        </p>
      </fieldset>

      {working && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="currentTitle" label="Current title">
            <Input
              id="currentTitle"
              value={currentTitle}
              onChange={(e) => setCurrentTitle(e.target.value)}
              maxLength={120}
            />
          </Field>
          <Field id="experienceYears" label="Total experience (years)">
            <Input
              id="experienceYears"
              type="number"
              min={0}
              max={60}
              step={0.5}
              value={experienceYears}
              onChange={(e) => setExperienceYears(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </Field>
          <Field id="currentSalary" label="Current salary (LPA)">
            <Input
              id="currentSalary"
              type="number"
              min={0}
              step={0.5}
              value={currentSalary}
              onChange={(e) => setCurrentSalary(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </Field>
          <Field id="notice" label="Notice period (days)">
            <Input
              id="notice"
              type="number"
              min={0}
              max={365}
              value={notice}
              onChange={(e) => setNotice(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </Field>
          <Field id="expectedMin" label="Expected minimum (LPA)">
            <Input
              id="expectedMin"
              type="number"
              min={0}
              step={0.5}
              value={expectedMin}
              onChange={(e) => setExpectedMin(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </Field>
          <Field id="expectedMax" label="Expected maximum (LPA)">
            <Input
              id="expectedMax"
              type="number"
              min={0}
              step={0.5}
              value={expectedMax}
              onChange={(e) => setExpectedMax(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </Field>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={busy}>
          Save changes
        </Button>
        {saved && <span className="text-sm text-[var(--color-success)]">Saved</span>}
        {error && (
          <span role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-[var(--color-fg-subtle)]">{hint}</p>}
    </div>
  );
}
