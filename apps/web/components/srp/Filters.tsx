'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition, type ChangeEvent, type ReactNode } from 'react';
import { Checkbox, Input, Label } from '@jobportal/ui';
// Direct path (NOT the lib/srp barrel) — the barrel re-exports
// loadSrpUserContext which touches Prisma. Importing from the barrel
// in a client component drags node:module into the browser bundle.
import { buildSrpHref, readSelections, type SrpHrefInput } from '../../lib/srp/params';

// All filter sub-components. Each reads/writes URL state via Next's router.
// They share a common patch helper so each toggle produces the next canonical
// URL via buildSrpHref (alphabetical query, no implicit defaults).

type Option = { slug: string; name: string };

function useFilterPatch(basePath: string) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function patch(next: Partial<SrpHrefInput>): void {
    const sel = readSelections(searchParams);
    const merged: SrpHrefInput = {
      q: searchParams.get('q') ?? undefined,
      skillSlugs: sel.skill,
      citySlugs: sel.city,
      industrySlug: sel.industry ?? undefined,
      emp: sel.emp,
      mode: sel.mode,
      minExperienceMonths: sel.expMin !== null ? sel.expMin * 12 : undefined,
      maxExperienceMonths: sel.expMax !== null ? sel.expMax * 12 : undefined,
      salaryMin: sel.salaryMin ?? undefined,
      postedWithinDays: sel.postedWithin ?? undefined,
      sort: sel.sort,
      page: undefined, // any filter change resets to page 1
      ...next,
    };
    const href = buildSrpHref(basePath, merged);
    startTransition(() => router.push(href));
  }

  return { patch, searchParams };
}

// === Generic section wrapper =====================================

function FilterSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[var(--color-border)] py-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left text-sm font-medium text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
      >
        {title}
        <span className="text-[var(--color-fg-subtle)]" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && <div className="mt-3 space-y-2">{children}</div>}
    </div>
  );
}

// === Skill multi-select ==========================================

export function SkillFilter({
  basePath,
  options,
}: {
  basePath: string;
  options: Option[];
}) {
  const { patch, searchParams } = useFilterPatch(basePath);
  const selected = new Set(searchParams.getAll('skill'));

  function toggle(slug: string): void {
    const next = new Set(selected);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    patch({ skillSlugs: Array.from(next) });
  }

  return (
    <FilterSection title="Skills">
      <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
        {options.map((opt) => {
          const id = `skill-${opt.slug}`;
          return (
            <div key={opt.slug} className="flex items-center gap-2">
              <Checkbox id={id} checked={selected.has(opt.slug)} onCheckedChange={() => toggle(opt.slug)} />
              <Label htmlFor={id} className="cursor-pointer font-normal">
                {opt.name}
              </Label>
            </div>
          );
        })}
      </div>
    </FilterSection>
  );
}

// === City multi-select (only on /jobs; SEO routes carry city in path) ==

export function CityFilter({
  basePath,
  options,
}: {
  basePath: string;
  options: Option[];
}) {
  const { patch, searchParams } = useFilterPatch(basePath);
  const selected = new Set(searchParams.getAll('city'));

  function toggle(slug: string): void {
    const next = new Set(selected);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    patch({ citySlugs: Array.from(next) });
  }

  return (
    <FilterSection title="City">
      <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
        {options.map((opt) => {
          const id = `city-${opt.slug}`;
          return (
            <div key={opt.slug} className="flex items-center gap-2">
              <Checkbox id={id} checked={selected.has(opt.slug)} onCheckedChange={() => toggle(opt.slug)} />
              <Label htmlFor={id} className="cursor-pointer font-normal">
                {opt.name}
              </Label>
            </div>
          );
        })}
      </div>
    </FilterSection>
  );
}

// === Industry single-select ======================================

export function IndustryFilter({
  basePath,
  options,
}: {
  basePath: string;
  options: Option[];
}) {
  const { patch, searchParams } = useFilterPatch(basePath);
  const current = searchParams.get('industry');

  function onChange(e: ChangeEvent<HTMLSelectElement>): void {
    const v = e.target.value;
    patch({ industrySlug: v === '' ? undefined : v });
  }

  return (
    <FilterSection title="Industry">
      <select
        value={current ?? ''}
        onChange={onChange}
        className="h-9 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
      >
        <option value="">Any industry</option>
        {options.map((o) => (
          <option key={o.slug} value={o.slug}>
            {o.name}
          </option>
        ))}
      </select>
    </FilterSection>
  );
}

// === Employment type / Work mode (chip group, multi-select) =======

const EMP_TYPES = [
  { value: 'FULL_TIME', label: 'Full-time' },
  { value: 'PART_TIME', label: 'Part-time' },
  { value: 'CONTRACTOR', label: 'Contract' },
  { value: 'INTERN', label: 'Internship' },
] as const;

export function EmploymentTypeFilter({ basePath }: { basePath: string }) {
  const { patch, searchParams } = useFilterPatch(basePath);
  const selected = new Set(searchParams.getAll('emp'));

  function toggle(value: string): void {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    patch({ emp: Array.from(next) });
  }

  return (
    <FilterSection title="Employment type">
      <div className="flex flex-wrap gap-2">
        {EMP_TYPES.map((o) => {
          const active = selected.has(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              aria-pressed={active}
              className={
                'rounded-md border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] ' +
                (active
                  ? 'border-[var(--color-fg)] bg-[var(--color-fg)] text-[var(--color-bg)]'
                  : 'border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]')
              }
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-[var(--color-fg-subtle)]">
        UI accepts the choice; schema columns land with the recruiter feature.
      </p>
    </FilterSection>
  );
}

const WORK_MODES = [
  { value: 'on-site', label: 'On-site' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'remote', label: 'Remote' },
] as const;

export function WorkModeFilter({ basePath }: { basePath: string }) {
  const { patch, searchParams } = useFilterPatch(basePath);
  const selected = new Set(searchParams.getAll('mode'));

  function toggle(value: string): void {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    patch({ mode: Array.from(next) });
  }

  return (
    <FilterSection title="Work mode">
      <div className="flex flex-wrap gap-2">
        {WORK_MODES.map((o) => {
          const active = selected.has(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              aria-pressed={active}
              className={
                'rounded-md border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] ' +
                (active
                  ? 'border-[var(--color-fg)] bg-[var(--color-fg)] text-[var(--color-bg)]'
                  : 'border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]')
              }
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </FilterSection>
  );
}

// === Experience min/max ===========================================

export function ExperienceFilter({ basePath }: { basePath: string }) {
  const { patch, searchParams } = useFilterPatch(basePath);
  const expMinRaw = searchParams.get('expMin');
  const expMaxRaw = searchParams.get('expMax');
  const [min, setMin] = useState(expMinRaw ?? '');
  const [max, setMax] = useState(expMaxRaw ?? '');

  function onCommit(): void {
    const minN = min === '' ? undefined : Number(min);
    const maxN = max === '' ? undefined : Number(max);
    patch({
      minExperienceMonths: minN !== undefined && Number.isFinite(minN) ? minN * 12 : undefined,
      maxExperienceMonths: maxN !== undefined && Number.isFinite(maxN) ? maxN * 12 : undefined,
    });
  }

  return (
    <FilterSection title="Experience (years)">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          max={40}
          value={min}
          onChange={(e) => setMin(e.target.value)}
          onBlur={onCommit}
          placeholder="Min"
          className="w-20"
          aria-label="Minimum years of experience"
        />
        <span className="text-sm text-[var(--color-fg-subtle)]">to</span>
        <Input
          type="number"
          min={0}
          max={40}
          value={max}
          onChange={(e) => setMax(e.target.value)}
          onBlur={onCommit}
          placeholder="Max"
          className="w-20"
          aria-label="Maximum years of experience"
        />
      </div>
    </FilterSection>
  );
}

// === Salary min ===================================================

export function SalaryFilter({ basePath }: { basePath: string }) {
  const { patch, searchParams } = useFilterPatch(basePath);
  const raw = searchParams.get('salaryMin');
  const initial = raw ? String(Math.floor(Number(raw) / 100_000_00)) : '';
  const [lakhs, setLakhs] = useState(initial);

  function onCommit(): void {
    const n = lakhs === '' ? undefined : Number(lakhs);
    if (n !== undefined && (!Number.isFinite(n) || n < 0)) return;
    patch({ salaryMin: n !== undefined ? n * 100_000_00 : undefined });
  }

  return (
    <FilterSection title="Min salary (₹ lakhs / year)">
      <Input
        type="number"
        min={0}
        max={500}
        value={lakhs}
        onChange={(e) => setLakhs(e.target.value)}
        onBlur={onCommit}
        placeholder="e.g. 12"
        className="w-24"
        aria-label="Minimum salary in lakhs per year"
      />
    </FilterSection>
  );
}

// === Posted-within radio =========================================

const POSTED = [
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
] as const;

export function PostedWithinFilter({ basePath }: { basePath: string }) {
  const { patch, searchParams } = useFilterPatch(basePath);
  const current = searchParams.get('postedWithin');

  function pick(value: string | null): void {
    if (value === null) {
      patch({ postedWithinDays: undefined });
      return;
    }
    const n = Number(value);
    if (n === 1 || n === 7 || n === 30) patch({ postedWithinDays: n });
  }

  return (
    <FilterSection title="Posted">
      <div className="space-y-1.5">
        {POSTED.map((o) => {
          const id = `posted-${o.value}`;
          const checked = current === o.value;
          return (
            <div key={o.value} className="flex items-center gap-2">
              <input
                id={id}
                type="radio"
                name="postedWithin"
                checked={checked}
                onChange={() => pick(o.value)}
                className="size-4 accent-[var(--color-primary-600)]"
              />
              <Label htmlFor={id} className="cursor-pointer font-normal">
                {o.label}
              </Label>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => pick(null)}
          className="mt-2 text-xs text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"
        >
          Clear
        </button>
      </div>
    </FilterSection>
  );
}
