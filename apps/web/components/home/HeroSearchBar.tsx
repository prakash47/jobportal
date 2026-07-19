'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@jobportal/ui';
import { Search, MapPin, Briefcase, ChevronDown } from '@jobportal/ui/icons';
import { EVENTS, track } from '../../lib/analytics/posthog';

// Hero search — a single tall flat elevated bar with three fields (what / where
// / exp), each opening a light-theme custom dropdown of suggestions on focus.
// Focusing a field shows NO per-field border (clean bar, per design); the
// dropdown is the affordance. Submit maps to the SRP: ?q= / ?city= / ?expMin=.

export interface HeroCity {
  slug: string;
  name: string;
}

type Field = 'what' | 'where' | 'exp';

// Curated role suggestions (alphabetical). Free text is still allowed — these
// are hints, not a closed list.
const JOB_ROLES: readonly string[] = [
  'AI Engineer',
  'Account Executive',
  'Accountant',
  'Android Developer',
  'Backend Engineer',
  'Business Analyst',
  'Cloud Architect',
  'Content Writer',
  'Data Analyst',
  'Data Engineer',
  'Data Scientist',
  'DevOps Engineer',
  'Digital Marketer',
  'Engineering Manager',
  'Finance Manager',
  'Frontend Engineer',
  'Full Stack Developer',
  'Graphic Designer',
  'HR Manager',
  'iOS Developer',
  'Machine Learning Engineer',
  'Marketing Manager',
  'Mobile Developer',
  'Operations Manager',
  'Product Designer',
  'Product Manager',
  'Project Manager',
  'QA Engineer',
  'Sales Executive',
  'Software Engineer',
  'UI/UX Designer',
];

const EXPERIENCE_OPTIONS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'Any experience', value: '' },
  { label: 'Fresher (0 years)', value: '0' },
  { label: '1 year', value: '1' },
  { label: '2 years', value: '2' },
  { label: '3 years', value: '3' },
  { label: '4 years', value: '4' },
  { label: '5 years', value: '5' },
  { label: '6 years', value: '6' },
  { label: '7 years', value: '7' },
  { label: '8 years', value: '8' },
  { label: '10 years', value: '10' },
  { label: '12 years', value: '12' },
  { label: '15+ years', value: '15' },
];

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function HeroSearchBar({
  cities,
  initialWhat = '',
  onSearch,
}: {
  cities: HeroCity[];
  /** Prefill the keyword field — used when the SRP search bar pops out into this. */
  initialWhat?: string;
  /** Called right after a successful search submit (e.g. to collapse the SRP popover). */
  onSearch?: () => void;
}) {
  const router = useRouter();
  const [what, setWhat] = useState(initialWhat);
  const [where, setWhere] = useState('');
  const [exp, setExp] = useState('');
  const [open, setOpen] = useState<Field | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Close any open dropdown on outside click or Escape.
  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (formRef.current && !formRef.current.contains(e.target as Node)) setOpen(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(null);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const roleMatches = useMemo(() => {
    const q = what.trim().toLowerCase();
    return q ? JOB_ROLES.filter((r) => r.toLowerCase().includes(q)) : JOB_ROLES;
  }, [what]);

  const cityMatches = useMemo(() => {
    const q = where.trim().toLowerCase();
    return q ? cities.filter((c) => c.name.toLowerCase().includes(q)) : cities;
  }, [where, cities]);

  const expLabel = EXPERIENCE_OPTIONS.find((o) => o.value === exp)?.label ?? 'Any experience';

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOpen(null);
    const params = new URLSearchParams();
    const q = what.trim();
    if (q) {
      params.set('q', q);
      track(EVENTS.SEARCH_PERFORMED, { queryLength: q.length });
    }
    const citySlug = slugify(where);
    if (citySlug) {
      const match = cities.find((c) => c.slug === citySlug || slugify(c.name) === citySlug);
      params.set('city', match ? match.slug : citySlug);
    }
    if (exp) params.set('expMin', exp);

    const sorted = new URLSearchParams(
      Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b)),
    );
    const qs = sorted.toString();
    router.push(qs ? `/jobs?${qs}` : '/jobs');
    onSearch?.();
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      role="search"
      className="mx-auto flex w-full max-w-4xl flex-col gap-2 rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] p-2 shadow-[var(--shadow-card)] transition-[border-color] duration-[var(--duration-base)] ease-[var(--ease-out)] focus-within:border-[var(--color-primary-400)] sm:flex-row sm:items-center sm:gap-0 sm:rounded-full sm:p-2"
    >
      {/* What (given more width than Where so the longer placeholder fits) */}
      <div className="relative flex-[1.4]">
        <div className="flex items-center gap-2.5 px-4">
          <Search className="size-5 shrink-0 text-[var(--color-fg-subtle)]" aria-hidden="true" />
          <input
            type="search"
            value={what}
            onChange={(e) => setWhat(e.target.value)}
            onFocus={() => setOpen('what')}
            placeholder="Job title, skills, or company"
            aria-label="Job title, skills, or company"
            autoComplete="off"
            className="h-14 w-full bg-transparent text-base font-semibold text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none"
          />
        </div>
        {open === 'what' && roleMatches.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-1.5 shadow-[var(--shadow-lift)]">
            {roleMatches.map((role) => (
              <li key={role}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setWhat(role);
                    setOpen(null);
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-[var(--color-fg)] transition-colors hover:bg-[var(--color-bg-muted)]"
                >
                  <Search className="size-4 shrink-0 text-[var(--color-fg-subtle)]" aria-hidden="true" />
                  {role}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="hidden h-8 w-px bg-[var(--color-border)] sm:block" aria-hidden="true" />

      {/* Where */}
      <div className="relative flex-1">
        <div className="flex items-center gap-2.5 px-4">
          <MapPin className="size-5 shrink-0 text-[var(--color-fg-subtle)]" aria-hidden="true" />
          <input
            type="text"
            value={where}
            onChange={(e) => setWhere(e.target.value)}
            onFocus={() => setOpen('where')}
            placeholder="City or 'Remote'"
            aria-label="Location"
            autoComplete="off"
            className="h-14 w-full bg-transparent text-base font-semibold text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none"
          />
        </div>
        {open === 'where' && cityMatches.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-1.5 shadow-[var(--shadow-lift)]">
            {cityMatches.map((c) => (
              <li key={c.slug}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setWhere(c.name);
                    setOpen(null);
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-[var(--color-fg)] transition-colors hover:bg-[var(--color-bg-muted)]"
                >
                  <MapPin className="size-4 shrink-0 text-[var(--color-fg-subtle)]" aria-hidden="true" />
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="hidden h-8 w-px bg-[var(--color-border)] sm:block" aria-hidden="true" />

      {/* Experience */}
      <div className="relative sm:w-64">
        <button
          type="button"
          onClick={() => setOpen(open === 'exp' ? null : 'exp')}
          aria-haspopup="listbox"
          aria-expanded={open === 'exp'}
          className="flex h-14 w-full items-center gap-2.5 px-4 text-base font-semibold text-[var(--color-fg)] focus:outline-none"
        >
          <Briefcase className="size-5 shrink-0 text-[var(--color-fg-subtle)]" aria-hidden="true" />
          <span className={exp ? '' : 'text-[var(--color-fg-subtle)]'}>{expLabel}</span>
          <ChevronDown
            className={`ml-auto size-4 shrink-0 text-[var(--color-fg-subtle)] transition-transform ${open === 'exp' ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
        {open === 'exp' && (
          <ul className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-1.5 shadow-[var(--shadow-lift)]">
            {EXPERIENCE_OPTIONS.map((o) => (
              <li key={o.value || 'any'}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setExp(o.value);
                    setOpen(null);
                  }}
                  className={`flex w-full items-center px-4 py-2.5 text-left text-sm transition-colors hover:bg-[var(--color-bg-muted)] ${o.value === exp ? 'font-medium text-[var(--color-primary-700)]' : 'text-[var(--color-fg)]'}`}
                >
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button
        type="submit"
        size="lg"
        leadingIcon={<Search className="size-4" aria-hidden="true" />}
        className="h-12 w-full shrink-0 sm:w-auto sm:rounded-full sm:px-8"
      >
        Search
      </Button>
    </form>
  );
}
