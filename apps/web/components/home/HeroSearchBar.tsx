'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@jobportal/ui';
import { Search, MapPin, Briefcase } from '@jobportal/ui/icons';
import { EVENTS, track } from '../../lib/analytics/posthog';

// Naukri-style three-field hero search, restyled to our minimal aesthetic
// (single bordered surface, hairline dividers between fields, one primary
// action). Inspiration is structural only — the three mental-model fields
// Indian job seekers expect: what / where / how much experience.
//
// - "what"  → ?q= full-text (title, skill, company)
// - "where" → ?city= slug (slugified from free text; a <datalist> offers the
//             popular cities so the common case is a clean slug match)
// - "exp"   → ?expMin= years (maps to the SRP's minExperienceMonths)

export interface HeroCity {
  slug: string;
  name: string;
}

const EXPERIENCE_OPTIONS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'Any experience', value: '' },
  { label: 'Fresher (0 yrs)', value: '0' },
  { label: '1+ years', value: '1' },
  { label: '3+ years', value: '3' },
  { label: '5+ years', value: '5' },
  { label: '10+ years', value: '10' },
];

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function HeroSearchBar({ cities }: { cities: HeroCity[] }) {
  const router = useRouter();
  const [what, setWhat] = useState('');
  const [where, setWhere] = useState('');
  const [exp, setExp] = useState('');

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const params = new URLSearchParams();
    const q = what.trim();
    if (q) {
      params.set('q', q);
      track(EVENTS.SEARCH_PERFORMED, { queryLength: q.length });
    }
    const citySlug = slugify(where);
    if (citySlug) {
      // Prefer an exact known-city slug; fall back to the slugified text.
      const match = cities.find(
        (c) => c.slug === citySlug || slugify(c.name) === citySlug,
      );
      params.set('city', match ? match.slug : citySlug);
    }
    if (exp) params.set('expMin', exp);

    // Keep the URL canonical (alphabetical keys per SRS §6.3).
    const sorted = new URLSearchParams(
      Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b)),
    );
    const qs = sorted.toString();
    router.push(qs ? `/jobs?${qs}` : '/jobs');
  }

  return (
    <form
      onSubmit={onSubmit}
      role="search"
      className="mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] p-2 shadow-sm sm:flex-row sm:items-center sm:gap-0 sm:rounded-full sm:p-1.5"
    >
      {/* What */}
      <div className="flex flex-1 items-center gap-2 px-3">
        <Search className="size-5 shrink-0 text-[var(--color-fg-subtle)]" aria-hidden="true" />
        <input
          type="search"
          value={what}
          onChange={(e) => setWhat(e.target.value)}
          placeholder="Job title, skill, or company"
          aria-label="Job title, skill, or company"
          className="h-11 w-full bg-transparent text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none"
        />
      </div>

      <div className="hidden h-7 w-px bg-[var(--color-border)] sm:block" aria-hidden="true" />

      {/* Where */}
      <div className="flex flex-1 items-center gap-2 px-3">
        <MapPin className="size-5 shrink-0 text-[var(--color-fg-subtle)]" aria-hidden="true" />
        <input
          type="text"
          list="hero-cities"
          value={where}
          onChange={(e) => setWhere(e.target.value)}
          placeholder="Location"
          aria-label="Location"
          className="h-11 w-full bg-transparent text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none"
        />
        <datalist id="hero-cities">
          {cities.map((c) => (
            <option key={c.slug} value={c.name} />
          ))}
        </datalist>
      </div>

      <div className="hidden h-7 w-px bg-[var(--color-border)] sm:block" aria-hidden="true" />

      {/* Experience */}
      <div className="flex items-center gap-2 px-3 sm:w-44">
        <Briefcase className="size-5 shrink-0 text-[var(--color-fg-subtle)]" aria-hidden="true" />
        <select
          value={exp}
          onChange={(e) => setExp(e.target.value)}
          aria-label="Experience"
          className="h-11 w-full cursor-pointer bg-transparent text-sm text-[var(--color-fg)] focus:outline-none"
        >
          {EXPERIENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" size="lg" className="w-full shrink-0 sm:w-auto sm:rounded-full">
        Search
      </Button>
    </form>
  );
}
