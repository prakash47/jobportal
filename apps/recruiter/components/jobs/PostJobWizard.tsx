'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, Input, Label, Textarea, cn } from '@jobportal/ui';
import type { JobType } from '../../lib/job-types';
import { SalaryTrendsPanel } from './SalaryTrendsPanel';
import { ReachMeter } from './ReachMeter';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface CatalogueEntry {
  id: number;
  slug: string;
  name: string;
}

export interface LocalityEntry {
  id: number;
  name: string;
  cityId: number;
}

interface QuotaState {
  daily: { count: number; limit: number };
  monthly: { count: number; limit: number };
  unlimited: boolean;
  upgradeAvailable: boolean;
}

type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACTOR' | 'INTERN';
type WorkMode = 'ONSITE' | 'REMOTE' | 'HYBRID';
type ExperienceLevel = 'ANY' | 'FRESHER' | 'EXPERIENCED';

// Prefill shape when starting from a template (a past job). Salary is carried in
// paise (the API's unit) and converted to LPA for the inputs. All optional — an
// absent key falls back to the blank/default the form uses for a new job.
export interface WizardInitialValues {
  title?: string;
  description?: string;
  descriptionMarkdown?: string | null;
  shortDescription?: string | null;
  skillIds?: number[];
  primaryCityId?: number | null;
  localityId?: number | null;
  cityIds?: number[];
  industryId?: number | null;
  functionalAreaId?: number | null;
  employmentType?: EmploymentType;
  workMode?: WorkMode;
  openings?: number | null;
  qualifications?: string | null;
  internshipDurationMonths?: number | null;
  experienceMinYears?: number | null;
  experienceMaxYears?: number | null;
  salaryMinPaise?: number | null;
  salaryMaxPaise?: number | null;
}

export interface PostJobWizardProps {
  companyName: string;
  skills: CatalogueEntry[];
  cities: CatalogueEntry[];
  localities: LocalityEntry[];
  industries: CatalogueEntry[];
  functionalAreas: CatalogueEntry[];
  quota: QuotaState | null;
  // Selected job-type product. Drives the Internship framing (INTERN employment
  // type + duration field) and is persisted (Phase 3). Defaults to FREE.
  jobType?: JobType;
  // Prefill from a chosen template (past job). Undefined = blank new job.
  initialValues?: WizardInitialValues | undefined;
  // 'edit' repurposes the form for an existing job: single "Save changes"
  // button PATCHing /recruiter/jobs/:jobId (no publishMode, no quota — status
  // transitions stay on the dedicated close/reopen endpoints). jobType is
  // display framing only in edit and is never sent.
  mode?: 'create' | 'edit';
  jobId?: number;
}

function lpaToPaise(lpa: number | ''): number | null {
  if (lpa === '' || Number.isNaN(lpa)) return null;
  return Math.round(Number(lpa) * 100_000 * 100);
}

function paiseToLpa(paise: number | null | undefined): number | '' {
  if (paise === null || paise === undefined) return '';
  return paise / 100_000 / 100;
}

// Plain-text fallback stored in `description` (used by JSON-LD/search/legacy
// render) — strips the Markdown the editor produces.
function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .trim();
}

// Derive the Any/Fresher/Experienced control from a prefill's numeric range.
function deriveExperienceLevel(min: number | null | undefined, max: number | null | undefined): ExperienceLevel {
  if ((min === null || min === undefined) && (max === null || max === undefined)) return 'ANY';
  if ((min ?? 0) === 0 && (max ?? 0) <= 1) return 'FRESHER';
  return 'EXPERIENCED';
}

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-3 text-sm';
const LOCALITY_OTHER = '__other__';

// Post a Job — the Job Details form (SRS §4.9.3). Single-column, sectioned:
// Job details → Location → Candidate requirements → Salary → Description, with a
// Save draft / Publish action row. jobType comes from the selector step.
export function PostJobWizard({
  companyName,
  skills,
  cities,
  localities,
  industries,
  functionalAreas,
  quota,
  jobType = 'FREE',
  initialValues,
  mode = 'create',
  jobId,
}: PostJobWizardProps) {
  const router = useRouter();
  const iv = initialValues ?? {};
  const isInternship = jobType === 'INTERNSHIP';
  const isEdit = mode === 'edit';

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Job details
  const [title, setTitle] = useState(iv.title ?? '');
  const [functionalAreaId, setFunctionalAreaId] = useState<number | ''>(iv.functionalAreaId ?? '');
  const [industryId, setIndustryId] = useState<number | ''>(iv.industryId ?? '');
  const [employmentType, setEmploymentType] = useState<EmploymentType>(
    isInternship ? 'INTERN' : iv.employmentType && iv.employmentType !== 'INTERN' ? iv.employmentType : 'FULL_TIME',
  );
  const [openings, setOpenings] = useState<number | ''>(iv.openings ?? 1);
  const [durationMonths, setDurationMonths] = useState<number | ''>(iv.internshipDurationMonths ?? '');

  // Location
  const [primaryCityId, setPrimaryCityId] = useState<number | ''>(iv.primaryCityId ?? '');
  const [localityId, setLocalityId] = useState<number | ''>(iv.localityId ?? '');
  const [localityOther, setLocalityOther] = useState('');
  const [useOtherLocality, setUseOtherLocality] = useState(false);
  const [workMode, setWorkMode] = useState<WorkMode>(iv.workMode ?? 'ONSITE');

  // Candidate requirements
  const [expLevel, setExpLevel] = useState<ExperienceLevel>(
    deriveExperienceLevel(iv.experienceMinYears, iv.experienceMaxYears),
  );
  const [expMinYears, setExpMinYears] = useState<number | ''>(iv.experienceMinYears ?? '');
  const [expMaxYears, setExpMaxYears] = useState<number | ''>(iv.experienceMaxYears ?? '');
  const [skillIds, setSkillIds] = useState<Set<number>>(new Set(iv.skillIds ?? []));
  const [skillQuery, setSkillQuery] = useState('');
  const [qualifications, setQualifications] = useState(iv.qualifications ?? '');

  // Salary
  const [salaryMinLpa, setSalaryMinLpa] = useState<number | ''>(paiseToLpa(iv.salaryMinPaise));
  const [salaryMaxLpa, setSalaryMaxLpa] = useState<number | ''>(paiseToLpa(iv.salaryMaxPaise));

  // Description — prefer the Markdown source when prefilling from a template.
  const [shortDescription, setShortDescription] = useState(iv.shortDescription ?? '');
  const [description, setDescription] = useState(iv.descriptionMarkdown ?? iv.description ?? '');

  const cityLocalities = useMemo(
    () => (primaryCityId === '' ? [] : localities.filter((l) => l.cityId === primaryCityId)),
    [localities, primaryCityId],
  );

  const filteredSkills = useMemo(() => {
    const q = skillQuery.trim().toLowerCase();
    const base = q ? skills.filter((s) => s.name.toLowerCase().includes(q)) : skills;
    return base.slice(0, 60);
  }, [skillQuery, skills]);

  // Quota only gates NEW publishes — editing an existing job never consumes.
  const exhausted =
    !isEdit &&
    quota !== null &&
    !quota.unlimited &&
    (quota.daily.count >= quota.daily.limit || quota.monthly.count >= quota.monthly.limit);

  // Publish requires the mandatory fields (SRS §4.9.3); a draft only needs a title.
  const titleOk = title.trim().length >= 3;
  const descriptionOk = description.trim().length >= 10;
  const canPublish =
    titleOk &&
    descriptionOk &&
    functionalAreaId !== '' &&
    openings !== '' &&
    Number(openings) >= 1 &&
    primaryCityId !== '';

  function onCityChange(v: number | '') {
    setPrimaryCityId(v);
    // Reset the area when the city changes — a locality belongs to one city.
    setLocalityId('');
    setUseOtherLocality(false);
    setLocalityOther('');
  }

  function onExpLevelChange(level: ExperienceLevel) {
    setExpLevel(level);
    if (level === 'ANY') {
      setExpMinYears('');
      setExpMaxYears('');
    } else if (level === 'FRESHER') {
      setExpMinYears(0);
      setExpMaxYears(1);
    }
    // EXPERIENCED keeps whatever is in the inputs (revealed below).
  }

  // Minimum experience in months for the Reach Meter query.
  const reachExpMonths =
    expLevel === 'FRESHER'
      ? 0
      : expLevel === 'EXPERIENCED' && expMinYears !== ''
        ? Number(expMinYears) * 12
        : null;

  // Insert Markdown around the current selection in the description textarea.
  function applyMarkdown(kind: 'bold' | 'bullet' | 'heading') {
    const ta = document.getElementById('description') as HTMLTextAreaElement | null;
    const start = ta?.selectionStart ?? description.length;
    const end = ta?.selectionEnd ?? description.length;
    const val = description;
    const selected = val.slice(start, end);
    let next: string;
    if (kind === 'bold') {
      next = `${val.slice(0, start)}**${selected || 'bold text'}**${val.slice(end)}`;
    } else if (kind === 'bullet') {
      const bulleted = (selected || 'List item')
        .split('\n')
        .map((l) => `- ${l}`)
        .join('\n');
      next = `${val.slice(0, start)}${bulleted}${val.slice(end)}`;
    } else {
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      next = `${val.slice(0, lineStart)}## ${val.slice(lineStart)}`;
    }
    setDescription(next);
  }

  async function submit(publishMode: 'DRAFT' | 'PUBLISH') {
    setBusy(true);
    setError(null);

    const md = description.trim();
    const plain = stripMarkdown(md);
    const body: Record<string, unknown> = {
      publishMode,
      title: title.trim(),
      // description holds the plain-text fallback; descriptionMarkdown carries
      // the rich source. Fall back to the raw text if stripping leaves it too
      // short for the API's 10-char minimum.
      description: plain.length >= 10 ? plain : md,
      jobType,
      employmentType,
      workMode,
    };
    if (md) body['descriptionMarkdown'] = md;
    if (shortDescription.trim()) body['shortDescription'] = shortDescription.trim();
    if (functionalAreaId !== '') body['functionalAreaId'] = functionalAreaId;
    if (industryId !== '') body['industryId'] = industryId;
    if (openings !== '') body['openings'] = Number(openings);
    if (isInternship && durationMonths !== '') body['internshipDurationMonths'] = Number(durationMonths);
    if (skillIds.size > 0) body['skillIds'] = [...skillIds];
    if (primaryCityId !== '') body['primaryCityId'] = primaryCityId;
    if (useOtherLocality) {
      if (localityOther.trim()) body['localityName'] = localityOther.trim();
    } else if (localityId !== '') {
      body['localityId'] = localityId;
    }
    if (qualifications.trim()) body['qualifications'] = qualifications.trim();
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

  // Edit mode — PATCH the existing job. Unlike create's omit-when-blank, a
  // blanked clearable field sends an explicit `null` (PATCH semantics:
  // omitted = unchanged, null = clear) so the recruiter can actually remove a
  // salary/area/etc. Status, publishMode and jobType are never sent — status
  // transitions stay on close/reopen, and the job keeps its purchased type.
  async function saveEdit() {
    if (jobId === undefined) return;
    setBusy(true);
    setError(null);

    const md = description.trim();
    const plain = stripMarkdown(md);
    const body: Record<string, unknown> = {
      title: title.trim(),
      description: plain.length >= 10 ? plain : md,
      descriptionMarkdown: md,
      employmentType,
      workMode,
      shortDescription: shortDescription.trim() ? shortDescription.trim() : null,
      industryId: industryId === '' ? null : industryId,
      qualifications: qualifications.trim() ? qualifications.trim() : null,
      experienceMinYears: expMinYears === '' ? null : Number(expMinYears),
      experienceMaxYears: expMaxYears === '' ? null : Number(expMaxYears),
      salaryMinPaise: lpaToPaise(salaryMinLpa),
      salaryMaxPaise: lpaToPaise(salaryMaxLpa),
      skillIds: [...skillIds],
    };
    // Required-for-publish fields are non-nullable on PATCH — blank means
    // "leave unchanged" rather than "clear".
    if (functionalAreaId !== '') body['functionalAreaId'] = functionalAreaId;
    if (openings !== '') body['openings'] = Number(openings);
    if (primaryCityId !== '') body['primaryCityId'] = primaryCityId;
    if (isInternship) {
      body['internshipDurationMonths'] = durationMonths === '' ? null : Number(durationMonths);
    }
    if (useOtherLocality && localityOther.trim()) {
      body['localityName'] = localityOther.trim();
    } else if (localityId !== '') {
      body['localityId'] = localityId;
    } else {
      body['localityId'] = null; // area deselected → clear it
    }

    try {
      const res = await fetch(`${API_URL}/recruiter/jobs/${jobId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(errBody.message ?? `Failed to save changes (${res.status})`);
      }
      router.push('/jobs');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-8">
      {/* Section: Job details */}
      <Section title="Job details">
        <Field label="Company">
          <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)]/40 px-3 py-2">
            <span className="text-sm font-medium text-[var(--color-fg)]">{companyName}</span>
            {/* A posted job can't move between companies — no Change while editing. */}
            {!isEdit && (
              <Link
                href="/profile"
                className="text-xs text-[var(--color-primary-600)] hover:underline"
              >
                Change
              </Link>
            )}
          </div>
        </Field>

        <Field label="Job department" hint="The function this role belongs to.">
          <select
            value={functionalAreaId}
            onChange={(e) => setFunctionalAreaId(e.target.value === '' ? '' : Number(e.target.value))}
            className={SELECT_CLASS}
          >
            <option value="">Select a department</option>
            {functionalAreas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Industry (optional)">
          <select
            value={industryId}
            onChange={(e) => setIndustryId(e.target.value === '' ? '' : Number(e.target.value))}
            className={SELECT_CLASS}
          >
            <option value="">—</option>
            {industries.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Job title / designation">
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="e.g. Senior Frontend Engineer"
          />
        </Field>

        {isInternship ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Internship type">
              <Segmented
                value={employmentType}
                onChange={(v) => setEmploymentType(v as EmploymentType)}
                options={[
                  { value: 'INTERN', label: 'Internship' },
                  { value: 'PART_TIME', label: 'Part-time' },
                ]}
              />
            </Field>
            <Field label="Duration (months)">
              <Input
                type="number"
                min={1}
                max={36}
                value={durationMonths}
                onChange={(e) => setDurationMonths(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="e.g. 6"
              />
            </Field>
          </div>
        ) : (
          <Field label="Job type">
            <Segmented
              value={employmentType}
              onChange={(v) => setEmploymentType(v as EmploymentType)}
              options={[
                { value: 'FULL_TIME', label: 'Full time' },
                { value: 'PART_TIME', label: 'Part time' },
                { value: 'CONTRACTOR', label: 'Contract' },
              ]}
            />
          </Field>
        )}

        <Field label="Number of openings">
          <Input
            type="number"
            min={1}
            max={9999}
            value={openings}
            onChange={(e) => setOpenings(e.target.value === '' ? '' : Number(e.target.value))}
            className="max-w-[140px]"
          />
        </Field>
      </Section>

      {/* Section: Location */}
      <Section title="Job location">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="City">
            <select
              value={primaryCityId}
              onChange={(e) => onCityChange(e.target.value === '' ? '' : Number(e.target.value))}
              className={SELECT_CLASS}
            >
              <option value="">Select a city</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Area / locality" hint={primaryCityId === '' ? 'Select a city first.' : undefined}>
            {useOtherLocality ? (
              <div className="space-y-1.5">
                <Input
                  value={localityOther}
                  onChange={(e) => setLocalityOther(e.target.value)}
                  maxLength={120}
                  placeholder="Type an area"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setUseOtherLocality(false)}
                  className="text-xs text-[var(--color-primary-600)] hover:underline"
                >
                  Choose from list instead
                </button>
              </div>
            ) : (
              <select
                value={localityId}
                disabled={primaryCityId === ''}
                onChange={(e) => {
                  if (e.target.value === LOCALITY_OTHER) {
                    setUseOtherLocality(true);
                    setLocalityId('');
                  } else {
                    setLocalityId(e.target.value === '' ? '' : Number(e.target.value));
                  }
                }}
                className={cn(SELECT_CLASS, primaryCityId === '' && 'opacity-50')}
              >
                <option value="">{cityLocalities.length ? 'Select an area' : 'No listed areas'}</option>
                {cityLocalities.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
                {primaryCityId !== '' && <option value={LOCALITY_OTHER}>Other (type an area)…</option>}
              </select>
            )}
          </Field>
        </div>

        <Field label="Work mode">
          <Segmented
            value={workMode}
            onChange={(v) => setWorkMode(v as WorkMode)}
            options={[
              { value: 'ONSITE', label: 'On-site' },
              { value: 'REMOTE', label: 'Remote' },
              { value: 'HYBRID', label: 'Hybrid' },
            ]}
          />
        </Field>
      </Section>

      {/* Section: Candidate requirements */}
      <Section title="Candidate requirements">
        <Field label="Total experience">
          <Segmented
            value={expLevel}
            onChange={(v) => onExpLevelChange(v as ExperienceLevel)}
            options={[
              { value: 'ANY', label: 'Any' },
              { value: 'FRESHER', label: 'Fresher only' },
              { value: 'EXPERIENCED', label: 'Experienced only' },
            ]}
          />
        </Field>

        {expLevel === 'EXPERIENCED' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Min experience (years)">
              <Input
                type="number"
                min={0}
                max={60}
                value={expMinYears}
                onChange={(e) => setExpMinYears(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </Field>
            <Field label="Max experience (years)">
              <Input
                type="number"
                min={0}
                max={60}
                value={expMaxYears}
                onChange={(e) => setExpMaxYears(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </Field>
          </div>
        )}

        <ChipPicker
          label="Key skills"
          entries={filteredSkills}
          selected={skillIds}
          onToggle={(id) => toggleId(skillIds, id, setSkillIds)}
          query={skillQuery}
          onQueryChange={setSkillQuery}
        />

        <Field label="Qualifications & must-haves" hint="Education, certifications, and any non-negotiable requirements.">
          <Textarea
            value={qualifications}
            onChange={(e) => setQualifications(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="e.g. B.E./B.Tech in CS or equivalent; strong DSA; 2+ years with React…"
          />
        </Field>
      </Section>

      {/* Section: Salary */}
      <Section title="Salary details">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Minimum (LPA)">
            <Input
              type="number"
              min={0}
              step={0.5}
              value={salaryMinLpa}
              onChange={(e) => setSalaryMinLpa(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </Field>
          <Field label="Maximum (LPA)">
            <Input
              type="number"
              min={0}
              step={0.5}
              value={salaryMaxLpa}
              onChange={(e) => setSalaryMaxLpa(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </Field>
        </div>
        <p className="text-xs text-[var(--color-fg-subtle)]">
          Annual CTC. Posts with a salary get more views and applies.
        </p>
      </Section>

      {/* Section: Description */}
      <Section title="Job description">
        <Field label="Short description" hint="One sentence shown on listings. Optional.">
          <Input
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
            maxLength={280}
          />
        </Field>
        <Field
          label="Description"
          hint="Roles & responsibilities, required skills, perks. Basic Markdown formatting supported."
        >
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              <ToolbarButton onClick={() => applyMarkdown('heading')} label="Heading">
                Heading
              </ToolbarButton>
              <ToolbarButton onClick={() => applyMarkdown('bold')} label="Bold">
                <span className="font-bold">B</span>
              </ToolbarButton>
              <ToolbarButton onClick={() => applyMarkdown('bullet')} label="Bulleted list">
                • List
              </ToolbarButton>
            </div>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={12}
              placeholder={'## About the role\n\nWhat the candidate will own.\n\n## You should have\n\n- 4+ years of…'}
            />
          </div>
        </Field>
      </Section>

      {error && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {exhausted && (
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 text-sm">
          <p className="font-medium text-[var(--color-fg)]">Daily or monthly post limit reached.</p>
          <p className="mt-1 text-[var(--color-fg-muted)]">
            {quota?.upgradeAvailable
              ? 'Upgrade your plan to post more jobs today.'
              : 'You can save this as a draft and publish later.'}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--color-border)] pt-5">
        {isEdit ? (
          <>
            <Button asChild variant="secondary">
              <Link href="/jobs">Cancel</Link>
            </Button>
            <Button
              variant="primary"
              onClick={saveEdit}
              loading={busy}
              disabled={!titleOk || !descriptionOk}
            >
              Save changes
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => submit('DRAFT')} loading={busy} disabled={!titleOk}>
              Save as draft
            </Button>
            <Button
              variant="primary"
              onClick={() => submit('PUBLISH')}
              loading={busy}
              disabled={!canPublish || exhausted}
            >
              Publish job
            </Button>
          </>
        )}
      </div>
      {!isEdit && !canPublish && titleOk && (
        <p className="text-right text-xs text-[var(--color-fg-subtle)]">
          To publish, add a department, title, description, openings, and a city.
        </p>
      )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <SalaryTrendsPanel title={title} cityId={primaryCityId} />
        <ReachMeter skillIds={[...skillIds]} cityId={primaryCityId} experienceMonths={reachExpMonths} />
      </aside>
    </div>
  );
}

function ToolbarButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)]"
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
        {title}
      </h2>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
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

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-md border border-[var(--color-border)] p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={cn(
              'rounded px-3 py-1.5 text-sm transition-colors',
              active
                ? 'bg-[var(--color-primary-600)] text-white'
                : 'text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-muted)]',
            )}
          >
            {o.label}
          </button>
        );
      })}
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

function toggleId(set: Set<number>, id: number, setter: (next: Set<number>) => void) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  setter(next);
}
