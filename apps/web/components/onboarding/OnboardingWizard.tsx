'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import { Button, cn } from '@jobportal/ui';
import { Check } from '@jobportal/ui/icons';
import { Logo } from '../brand/Logo';
import { apiSend } from './api';
import { StepTracker, type TrackerStatus } from './StepTracker';
import { QuickTips } from './QuickTips';
import { type ChipOption } from './ChipMultiSelect';
import { EmploymentStep, NOTICE_PERIODS, type EmploymentValue } from './EmploymentStep';
import { EducationStep, type EduSection } from './EducationStep';
import { HeadlinePreferencesStep, type HeadlinePrefsValue } from './HeadlinePreferencesStep';
import { CLASS12_DEGREE } from './education-constants';
import { type SelectedSkill } from './SkillAutocomplete';
import { type ProjectItem } from './ProjectsEditor';
import { type LanguageItem } from './LanguagesEditor';

// 3 data steps (0 = employment, 1 = education, 2 = headline & preferences) + a
// final "done" screen (3).
const DATA_STEPS = 3;
const TOTAL = DATA_STEPS + 1;

const STEP_META = [
  {
    title: 'Employment & professional details',
    subtitle: 'Tell recruiters where you are in your career. Skip anything you like.',
  },
  {
    title: 'Education details',
    subtitle: 'Add your most recent degree and Class 12. Skip anything you like.',
  },
  {
    title: 'Headline & preferences',
    subtitle: 'Round out your profile so the right roles find you.',
  },
] as const;

// Left-rail progress milestones. "Account" is already done (they registered to
// get here); the rest mirror the three data steps.
const TRACKER_META = [
  { label: 'Account', desc: 'Your details' },
  { label: 'Work profile', desc: 'Experience & skills' },
  { label: 'Education', desc: 'Your background' },
  { label: 'Preferences', desc: 'Headline & more' },
] as const;

export interface OnboardingWizardProps {
  initial: {
    workStatus: 'FRESHER' | 'EXPERIENCED' | null;
    lookingFor: 'JOB' | 'INTERNSHIP' | 'BOTH' | null;
    experienceMonths: number | null;
    currentSalaryPaise: number | null;
    currentCompanyName: string;
    currentTitle: string;
    currentCityName: string;
    industryId: number | null;
    noticePeriodDays: number | null;
    skillIds: number[];
    cityIds: number[];
    headline: string;
    expectedSalaryMinPaise: number | null;
    gender: 'MALE' | 'FEMALE' | 'PREFER_NOT_TO_SAY' | null;
  };
  education: { degree: EduSection; class12: EduSection };
  currentYear: number;
  skills: ChipOption[];
  cities: { id: number; name: string; state: string }[];
  industries: { id: number; name: string }[];
  projects: ProjectItem[];
  languages: LanguageItem[];
}

// Post-registration onboarding wizard. The seeker is already auto-logged-in, so
// each step saves real candidate-profile data; projects + languages persist as
// they're added. Every step is skippable; flat navy/cyan brand, fully responsive
// (gutter-inset card on phones, centred on desktop, page scrolls when a step is
// taller than the viewport).
export function OnboardingWizard({
  initial,
  education,
  currentYear,
  skills,
  cities,
  industries,
  projects: initialProjects,
  languages: initialLanguages,
}: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 0 — employment & professional. experienceMonths splits into the two
  // selects (clamped to the 0–40y range the UI offers).
  const initialMonths = initial.experienceMonths ?? 0;
  const initYears = Math.min(Math.floor(initialMonths / 12), 40);
  const initRemMonths = initialMonths % 12;

  const skillLabelById = new Map(skills.map((s) => [s.id, s.label]));

  const [emp, setEmp] = useState<EmploymentValue>({
    workStatus: initial.workStatus,
    lookingFor: initial.lookingFor,
    expYears: String(initYears),
    expMonths: String(initRemMonths),
    salary: initial.currentSalaryPaise != null ? String(Math.round(initial.currentSalaryPaise / 100)) : '',
    company: initial.currentCompanyName,
    designation: initial.currentTitle,
    city: initial.currentCityName,
    industryId: initial.industryId != null ? String(initial.industryId) : '',
    // Coerce a stored value that isn't one of the preset options to '' so the
    // native <select> shows the placeholder instead of silently blank-selecting.
    noticePeriod:
      initial.noticePeriodDays != null &&
      NOTICE_PERIODS.some((n) => n.value === String(initial.noticePeriodDays))
        ? String(initial.noticePeriodDays)
        : '',
  });
  const updateEmp = (patch: Partial<EmploymentValue>) => setEmp((e) => ({ ...e, ...patch }));

  const [skillSelection, setSkillSelection] = useState<SelectedSkill[]>(
    initial.skillIds.flatMap((id) => {
      const name = skillLabelById.get(id);
      return name ? [{ id, name }] : [];
    }),
  );
  const [projects, setProjects] = useState<ProjectItem[]>(initialProjects);
  const [languages, setLanguages] = useState<LanguageItem[]>(initialLanguages);

  // Step 1 — education.
  const [degreeEdu, setDegreeEdu] = useState<EduSection>(education.degree);
  const [class12Edu, setClass12Edu] = useState<EduSection>(education.class12);

  // Step 2 — headline & preferences (preferred locations reuse preferredCityIds).
  const [cityIds, setCityIds] = useState<number[]>(initial.cityIds);
  const [hp, setHp] = useState<HeadlinePrefsValue>({
    headline: initial.headline,
    positionRole: initial.currentTitle,
    salary:
      initial.expectedSalaryMinPaise != null
        ? String(Math.round(initial.expectedSalaryMinPaise / 100))
        : '',
    gender: initial.gender,
  });

  const cityOptions: ChipOption[] = cities.map((c) => ({ id: c.id, label: c.name, sublabel: c.state }));

  // Move focus to the new step's heading on each transition (the content subtree
  // remounts via key={step}, otherwise keyboard focus drops to <body> and the
  // change is never announced). Skip the initial mount. WCAG 2.4.3.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  // PATCH helper — returns an error string (readable, never "[object Object]")
  // or null on success.
  async function patch(path: string, body: object): Promise<string | null> {
    const res = await apiSend(path, 'PATCH', body);
    return res.ok ? null : res.error;
  }

  // Upsert one education section. Returns false (and sets `error`) on a real
  // failure; an empty section (no institute) is a no-op success (skipped).
  async function saveEducationSection(
    section: EduSection,
    setSection: Dispatch<SetStateAction<EduSection>>,
    isClass12: boolean,
  ): Promise<boolean> {
    const institute = section.institute.trim();
    if (!institute) return true; // empty section — nothing to save

    const degreeName = isClass12 ? CLASS12_DEGREE : section.degree.trim();
    if (!isClass12 && !degreeName) {
      setError('Please enter your degree name.');
      return false;
    }
    // Don't let a user-entered first-degree name collide with the Class 12
    // sentinel — it would mis-map (and drop) both rows on the next load.
    if (!isClass12 && degreeName.toLowerCase() === CLASS12_DEGREE.toLowerCase()) {
      setError('Please enter a specific degree name (not “Class XII”).');
      return false;
    }
    if (!section.startYear) {
      setError('Please select a starting year.');
      return false;
    }
    const startYear = Number(section.startYear);

    const body: Record<string, unknown> = { institute, degree: degreeName, startYear };
    if (section.fieldOfStudy.trim()) body.fieldOfStudy = section.fieldOfStudy.trim();
    if (section.pursuing) {
      body.endYear = null; // ongoing — null ⇔ currently pursuing
    } else {
      if (!section.endYear) {
        setError('Select an ending year, or tick “Currently pursuing”.');
        return false;
      }
      const endYear = Number(section.endYear);
      if (endYear < startYear) {
        setError('Ending year must be the same as or after the starting year.');
        return false;
      }
      body.endYear = endYear;
    }
    if (!isClass12 && section.grade.trim()) body.grade = section.grade.trim();

    if (section.id != null) {
      const err = await patch(`/me/education/${section.id}`, body);
      if (err) return (setError(err), false);
    } else {
      const res = await apiSend<{ id: number }>('/me/education', 'POST', body);
      if (!res.ok) return (setError(res.error), false);
      const newId = res.data.id;
      setSection((s) => ({ ...s, id: newId }));
    }
    return true;
  }

  async function saveStep(s: number): Promise<boolean> {
    if (s === 0) {
      const body: Record<string, unknown> = {};
      if (emp.workStatus) body.workStatus = emp.workStatus;
      if (emp.lookingFor) body.lookingFor = emp.lookingFor;

      if (emp.workStatus === 'EXPERIENCED') {
        body.experienceMonths = Number(emp.expYears) * 12 + Number(emp.expMonths);
        if (emp.salary.trim() !== '') {
          const rupees = Number(emp.salary);
          if (!Number.isFinite(rupees) || rupees < 0) {
            setError('Enter your annual salary as a number.');
            return false;
          }
          const paise = Math.round(rupees) * 100;
          if (paise > 2_000_000_000) {
            setError('Please enter a realistic annual salary.');
            return false;
          }
          body.currentSalaryPaise = paise;
        }
        if (emp.company.trim()) body.currentCompanyName = emp.company.trim();
        if (emp.designation.trim()) body.currentTitle = emp.designation.trim();
        if (emp.city.trim()) body.currentCityName = emp.city.trim();
        if (emp.industryId !== '') body.industryId = Number(emp.industryId);
        if (emp.noticePeriod !== '') body.noticePeriodDays = Number(emp.noticePeriod);
      } else if (emp.workStatus === 'FRESHER') {
        body.experienceMonths = 0;
      }

      if (Object.keys(body).length > 0) {
        const err = await patch('/me/profile', body);
        if (err) return (setError(err), false);
      }

      // Only touch skills if there's something to save or clear.
      if (skillSelection.length > 0 || initial.skillIds.length > 0) {
        const skillIds = skillSelection.flatMap((sk) => (sk.id !== undefined ? [sk.id] : []));
        const customSkills = skillSelection.flatMap((sk) => (sk.id === undefined ? [sk.name] : []));
        const err = await patch('/me/skills', { skillIds, customSkills });
        if (err) return (setError(err), false);
      }
      return true;
    }

    if (s === 1) {
      if (!(await saveEducationSection(degreeEdu, setDegreeEdu, false))) return false;
      if (!(await saveEducationSection(class12Edu, setClass12Edu, true))) return false;
      return true;
    }

    if (s === 2) {
      const body: Record<string, unknown> = { preferredCityIds: cityIds };
      // Send headline only when there's something to save or clear — avoids a
      // null→'' write (and a spurious audit row) when it's left blank.
      const headline = hp.headline.trim();
      if (headline || initial.headline) body.headline = headline;
      // Only overwrite currentTitle when the user actually entered a role here,
      // so leaving it blank preserves a Designation set on the first step.
      if (hp.positionRole.trim()) body.currentTitle = hp.positionRole.trim();
      if (hp.gender) body.gender = hp.gender;
      if (hp.salary.trim() !== '') {
        const rupees = Number(hp.salary);
        if (!Number.isFinite(rupees) || rupees < 0) {
          setError('Enter your preferred salary as a number.');
          return false;
        }
        const paise = Math.round(rupees) * 100;
        if (paise > 2_000_000_000) {
          setError('Please enter a realistic salary.');
          return false;
        }
        body.expectedSalaryMinPaise = paise;
      }
      const err = await patch('/me/profile', body);
      if (err) return (setError(err), false);
    }
    return true;
  }

  async function onContinue() {
    setError(null);
    setSaving(true);
    const ok = await saveStep(step);
    setSaving(false);
    if (ok) setStep((s) => Math.min(s + 1, TOTAL - 1));
  }
  function onSkip() {
    setError(null);
    setStep((s) => Math.min(s + 1, TOTAL - 1));
  }
  function onBack() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }
  function finish(dest: string) {
    router.push(dest);
    router.refresh();
  }

  const isDone = step === TOTAL - 1;
  const meta = STEP_META[step];

  const trackerSteps = TRACKER_META.map((m, t) => {
    let status: TrackerStatus;
    if (t === 0) {
      status = 'done'; // account — already created
    } else {
      const w = t - 1; // tracker entry t maps to data step (t - 1)
      status = step > w ? 'done' : step === w ? 'active' : 'upcoming';
    }
    return { label: m.label, desc: m.desc, status };
  });

  function renderFields() {
    switch (step) {
      case 0:
        return (
          <EmploymentStep
            value={emp}
            onChange={updateEmp}
            skills={skills}
            skillSelection={skillSelection}
            onSkillsChange={setSkillSelection}
            industries={industries}
            projects={projects}
            onProjectsChange={setProjects}
            languages={languages}
            onLanguagesChange={setLanguages}
          />
        );
      case 1:
        return (
          <EducationStep
            currentYear={currentYear}
            degree={degreeEdu}
            onDegreeChange={(patch) => setDegreeEdu((d) => ({ ...d, ...patch }))}
            class12={class12Edu}
            onClass12Change={(patch) => setClass12Edu((c) => ({ ...c, ...patch }))}
          />
        );
      case 2:
        return (
          <HeadlinePreferencesStep
            value={hp}
            onChange={(patch) => setHp((h) => ({ ...h, ...patch }))}
            cityOptions={cityOptions}
            cityIds={cityIds}
            onCityIdsChange={setCityIds}
          />
        );
      default:
        return null;
    }
  }

  // items-stretch makes the side rails fill the row height, giving their sticky
  // children room to travel until the card scrolls past; the card column
  // re-asserts items-start so the card keeps its natural height.
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 items-stretch gap-8 px-4 py-8 sm:px-6 lg:gap-10 lg:py-12">
      {/* Plain div, not <aside>: StepTracker's inner <nav aria-label> is already
          the labelled landmark — a wrapping aside would add a 2nd unnamed one. */}
      <div className="hidden w-56 shrink-0 lg:block">
        <StepTracker title="Your progress" steps={trackerSteps} />
      </div>
      <div className="flex w-full min-w-0 flex-1 items-start justify-center">
        <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-float)]">
          {/* Card header: logo (always) + skip + mobile-only progress (the rail
              covers desktop). The logo anchors every card, including "all set". */}
          <div className="px-6 pt-6 sm:px-8">
            <div className="flex items-center justify-between gap-3">
              <Logo variant="mark" className="h-7 w-auto" />
              {!isDone && (
                <button
                  type="button"
                  onClick={() => finish('/jobs')}
                  className="text-sm text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
                >
                  Skip for now
                </button>
              )}
            </div>
            {!isDone && (
              <div className="mt-4 lg:hidden">
                <div className="flex gap-1.5" aria-hidden="true">
                  {Array.from({ length: DATA_STEPS }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        'h-1.5 flex-1 rounded-full transition-colors duration-[var(--duration-base)]',
                        i <= Math.min(step, DATA_STEPS - 1)
                          ? 'bg-[var(--color-primary-600)]'
                          : 'bg-[var(--color-border)]',
                      )}
                    />
                  ))}
                </div>
                <p className="mt-2 text-xs font-medium text-[var(--color-fg-muted)]">
                  Step {step + 1} of {DATA_STEPS}
                </p>
              </div>
            )}
          </div>

        {/* Step content — keyed by step so the entrance animation replays each move */}
        <div key={step} className="rise px-6 py-6 sm:px-8">
          {isDone ? (
            <div className="flex flex-col items-center py-4 text-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-[var(--color-primary-600)]">
                <Check className="size-8 text-white" aria-hidden="true" />
              </div>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="mt-5 text-2xl font-semibold tracking-tight text-[var(--color-fg)] outline-none"
              >
                You&apos;re all set!
              </h1>
              <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
                Your profile is ready. Let&apos;s look at your dashboard.
              </p>
              <Button type="button" onClick={() => finish('/profile')} size="lg" className="mt-6 w-full">
                Go to dashboard
              </Button>
            </div>
          ) : (
            <div className="min-h-[15rem]">
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="text-2xl font-semibold tracking-tight text-[var(--color-fg)] outline-none"
              >
                {meta?.title}
              </h1>
              <p className="mt-1.5 text-sm text-[var(--color-fg-muted)]">{meta?.subtitle}</p>
              <div className="mt-6">{renderFields()}</div>
              {error && (
                <p role="alert" className="mt-4 text-sm text-[var(--color-danger)]">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer nav */}
        {!isDone && (
          <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] px-6 py-4 sm:px-8">
            <Button
              type="button"
              variant="ghost"
              onClick={onBack}
              disabled={step === 0 || saving}
              className={step === 0 ? 'invisible' : undefined}
            >
              Back
            </Button>
            <div className="flex items-center gap-1">
              {step > 0 && (
                <button
                  type="button"
                  onClick={onSkip}
                  disabled={saving}
                  className="rounded-md px-3 py-2 text-sm font-medium text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)] disabled:opacity-50"
                >
                  Skip
                </button>
              )}
              <Button type="button" onClick={onContinue} loading={saving}>
                Continue
              </Button>
            </div>
          </div>
        )}
        </div>
      </div>
      <aside aria-label="Tips" className="hidden w-64 shrink-0 xl:block">
        <QuickTips step={step} />
      </aside>
    </main>
  );
}
