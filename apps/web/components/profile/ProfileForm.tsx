'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  cn,
} from '@jobportal/ui';
import { api } from '../../lib/profile/api-client';
import { CountryCodeSelect } from '../ui/CountryCodeSelect';
import { MultiCombobox, SingleCombobox } from '../ui/Combobox';
import type { ComboboxOption } from '../../lib/ui/combobox-filter';
import { joinPhone, splitPhone } from '../../lib/phone/format';
import { GENDER_OPTIONS, NATIONALITY_OPTIONS } from '../../lib/profile/catalogues';
import {
  counterState,
  HEADLINE_MAX,
  maxBirthDate,
  minBirthDate,
  phoneDigitLimit,
  phoneStatus,
  sanitizePhoneInput,
  SUMMARY_MAX,
  toDateInputValue,
} from '../../lib/profile/validation';

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
    /** The account's login address. Read-only here — see the field comment. */
    email: string;
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
    dateOfBirth: string | null;
    gender: string | null;
    nationality: string | null;
    currentCityId: number | null;
    preferredCityIds: number[];
  };
  cityCatalogue: ComboboxOption[];
}

export function ProfileForm({ initial, cityCatalogue }: ProfileFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  // Split the single stored `phone` column into a country and a national
  // number. Rows written before this control existed have no dial code and
  // fall back to the default rather than becoming uneditable.
  const initialPhone = splitPhone(initial.phone);
  const [phoneIso, setPhoneIso] = useState(initialPhone.iso);
  // Sanitised up front too: a row saved before this rule existed may hold
  // letters or more digits than the country allows.
  const [phone, setPhone] = useState(sanitizePhoneInput(initialPhone.national, initialPhone.iso));
  const [headline, setHeadline] = useState(initial.headline ?? '');
  const [summary, setSummary] = useState(initial.summary ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(toDateInputValue(initial.dateOfBirth));
  const [gender, setGender] = useState(initial.gender ?? '');
  const [nationality, setNationality] = useState<string | null>(initial.nationality);
  const [currentCityId, setCurrentCityId] = useState<string | null>(
    initial.currentCityId === null ? null : String(initial.currentCityId),
  );
  const [preferredCityIds, setPreferredCityIds] = useState<string[]>(
    initial.preferredCityIds.map(String),
  );
  // "Working or fresher?" gate. New profiles default to Working so the work
  // fields are visible; a fresher flips it to hide them.
  const [workStatus, setWorkStatus] = useState<WorkStatus>(initial.workStatus ?? 'EXPERIENCED');
  const working = workStatus === 'EXPERIENCED';
  const [experienceYears, setExperienceYears] = useState<number | ''>(
    initial.experienceMonths !== null ? Math.round((initial.experienceMonths / 12) * 10) / 10 : '',
  );
  const [currentTitle, setCurrentTitle] = useState(initial.currentTitle ?? '');
  const [currentSalary, setCurrentSalary] = useState<number | ''>(
    paiseToLpa(initial.currentSalaryPaise),
  );
  // ONE expected-salary figure. The column pair stays (recruiter and admin
  // surfaces read both), but this form writes the minimum and clears the
  // maximum, so the range renders as "₹15+ LPA" rather than a bogus "₹15–15".
  // Falls back to the stored max for a row that only ever had one.
  const [expected, setExpected] = useState<number | ''>(
    paiseToLpa(initial.expectedSalaryMinPaise ?? initial.expectedSalaryMaxPaise),
  );
  const [notice, setNotice] = useState<number | ''>(initial.noticePeriodDays ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const phoneLimit = phoneDigitLimit(phoneIso);
  const phoneState = phoneStatus(phone, phoneIso);
  const headlineCount = counterState(headline, HEADLINE_MAX);
  const summaryCount = counterState(summary, SUMMARY_MAX);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (phoneState === 'incomplete') {
      setError(`Enter all ${phoneLimit} digits of your phone number, or clear the field.`);
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);

    const patch: Record<string, unknown> = { name, workStatus };

    // Every optional field is sent on EVERY save — as a value when filled and
    // as an explicit null when empty. Previously an empty field was omitted,
    // and an omitted key means "no change" on a PATCH: erasing a phone number
    // and saving kept the old one, which then reappeared on the next load.
    // That was the reported bug, and it was true of every field here.
    //
    // Same join as signup, so the two forms cannot drift into storing
    // different shapes for the same column.
    patch['phone'] = joinPhone(phoneIso, phone);
    patch['headline'] = headline.trim() || null;
    patch['summary'] = summary.trim() || null;
    patch['dateOfBirth'] = dateOfBirth || null;
    patch['gender'] = gender || null;
    patch['nationality'] = nationality ?? null;
    patch['currentCityId'] = currentCityId === null ? null : Number(currentCityId);
    // Always sent: this is the only control for the list, so an empty array is
    // a real instruction ("I cleared my preferences"), not an absent one.
    patch['preferredCityIds'] = preferredCityIds.map(Number);

    // Work-history fields only apply to experienced candidates. When "Fresher"
    // is selected we omit them — the PATCH DTO can't clear to null, so any
    // previously-saved values simply stay hidden behind the FRESHER status.
    if (working) {
      // Same rule as above: sent every time, null when cleared.
      patch['experienceMonths'] =
        experienceYears === '' ? null : Math.round(Number(experienceYears) * 12);
      patch['currentTitle'] = currentTitle.trim() || null;
      patch['currentSalaryPaise'] = lpaToPaise(currentSalary);
      patch['expectedSalaryMinPaise'] = lpaToPaise(expected);
      // Explicit null clears a max left by the old two-box form.
      patch['expectedSalaryMaxPaise'] = null;
      patch['noticePeriodDays'] = notice === '' ? null : Number(notice);
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
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
        />
      </Field>

      {/*
        The login address, shown so the form is not missing the one identifier
        every recruiter sees, and read-only because changing it is a change of
        account identity: it is the login, it is what the verification token was
        issued against, and swapping it in a profile PATCH would let someone
        take over an address they have never proved they control. Changing it
        belongs behind a re-verification flow, which does not exist yet.
      */}
      <Field
        id="email"
        label="Email"
        hint="Your login address. To change it you'll need to verify the new one — contact support for now."
      >
        <Input
          id="email"
          type="email"
          value={initial.email}
          readOnly
          aria-readonly="true"
          autoComplete="email"
          className="cursor-not-allowed bg-[var(--color-bg-muted)] text-[var(--color-fg-muted)]"
        />
      </Field>

      <Field
        id="phone"
        label="Phone"
        hint={`Optional. Digits only${phoneLimit === 10 ? ', 10 for an Indian number' : ''}. Recruiters won't see this until you apply.`}
      >
        <div className="flex gap-2">
          <CountryCodeSelect
            value={phoneIso}
            onChange={(iso) => {
              setPhoneIso(iso);
              // Re-clamp: switching from a 14-digit country to India must not
              // leave an over-long number sitting in the field.
              setPhone((current) => sanitizePhoneInput(current, iso));
            }}
          />
          <Input
            id="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={phone}
            onChange={(e) => setPhone(sanitizePhoneInput(e.target.value, phoneIso))}
            maxLength={phoneLimit}
            aria-invalid={phoneState === 'incomplete'}
            placeholder={phoneLimit === 10 ? '9876543210' : undefined}
          />
        </div>
        {phoneState === 'incomplete' && (
          <p className="text-xs text-[var(--color-danger)]">
            {phone.length} of {phoneLimit} digits.
          </p>
        )}
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="dateOfBirth" label="Date of birth" hint="Only you and our team can see this.">
          {/*
            The native date input, deliberately: it opens the platform's own
            calendar picker, is keyboard- and screen-reader-accessible for free,
            and localises its display format to the user. A hand-rolled calendar
            would be a large component that does all of that worse.
          */}
          <Input
            id="dateOfBirth"
            type="date"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            min={minBirthDate()}
            max={maxBirthDate()}
          />
        </Field>

        <div className="space-y-1.5">
          <Label htmlFor="gender">Gender</Label>
          <Select value={gender} onValueChange={setGender}>
            <SelectTrigger id="gender" aria-label="Gender">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {GENDER_OPTIONS.map((g) => (
                <SelectItem key={g.value} value={g.value}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-[var(--color-fg-subtle)]">
            Optional. Used for diversity reporting only, never shown on your profile.
          </p>
        </div>
      </div>

      <SingleCombobox
        id="nationality"
        label="Nationality"
        hint="Helps recruiters know whether a role needs work authorisation."
        placeholder="Search nationalities…"
        options={NATIONALITY_OPTIONS}
        value={nationality}
        onChange={setNationality}
      />

      <SingleCombobox
        id="currentCity"
        label="Current location"
        hint="Where you are based today."
        placeholder="Search cities…"
        options={cityCatalogue}
        value={currentCityId}
        onChange={setCurrentCityId}
        emptyLabel="No city matches that name"
      />

      <MultiCombobox
        id="preferredCities"
        label="Preferred locations"
        hint="Where you'd move for the right role. Pick up to 10 — these drive your job recommendations."
        placeholder="Search cities…"
        options={cityCatalogue}
        selected={preferredCityIds}
        onChange={setPreferredCityIds}
        max={10}
        emptyLabel="No city matches that name"
      />

      <Field id="headline" label="Headline" hint="One line, e.g. 'Staff Engineer building dev tools'.">
        <Input
          id="headline"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          maxLength={HEADLINE_MAX}
          aria-describedby="headline-counter"
        />
        <Counter id="headline-counter" state={headlineCount} />
      </Field>

      <Field id="summary" label="Summary" hint="A few sentences about what you do.">
        <Textarea
          id="summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={5}
          maxLength={SUMMARY_MAX}
          aria-describedby="summary-counter"
        />
        <Counter id="summary-counter" state={summaryCount} />
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
          <Field
            id="experienceYears"
            label="Total experience (years)"
            hint="Decimals are fine — 6.7 is about 6 years 8 months."
          >
            {/* step 0.1, not 0.5. The half-year step rejected 8.3 and 6.7 in
                browsers that validate against it, and nudged everyone onto a
                coarser number than they actually have. Months are the stored
                unit anyway (experienceMonths), so 0.1 of a year rounds to
                roughly one month — finer than that would be false precision. */}
            <Input
              id="experienceYears"
              type="number"
              min={0}
              max={60}
              step={0.1}
              value={experienceYears}
              onChange={(e) =>
                setExperienceYears(e.target.value === '' ? '' : Number(e.target.value))
              }
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
          <Field
            id="expected"
            label="Expected salary (LPA)"
            hint="A single figure — recruiters see it as your minimum."
          >
            <Input
              id="expected"
              type="number"
              min={0}
              step={0.5}
              value={expected}
              onChange={(e) => setExpected(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </Field>
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-[var(--color-border)] pt-6">
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

function Counter({
  id,
  state,
}: {
  id: string;
  state: ReturnType<typeof counterState>;
}) {
  return (
    <p
      id={id}
      // Not aria-live: it would announce on every keystroke. The number is
      // reachable on demand through aria-describedby on the field itself.
      className={cn(
        'text-right text-xs tabular-nums',
        state.tone === 'over'
          ? 'font-medium text-[var(--color-danger)]'
          : state.tone === 'warning'
            ? 'text-[color-mix(in_oklch,var(--color-warning),var(--color-fg)_30%)]'
            : 'text-[var(--color-fg-subtle)]',
      )}
    >
      {state.used} / {state.max} characters
    </p>
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
