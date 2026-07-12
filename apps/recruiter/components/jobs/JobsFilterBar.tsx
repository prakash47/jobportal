'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, Search, X } from '@jobportal/ui/icons';
import { cn, Input, Label } from '@jobportal/ui';
import { JOB_STATUS_META, type JobStatus } from './JobStatusBadge';
import { JOB_TYPE_LABELS, type JobCategory } from './job-list-format';

export interface JobsFilterBarProps {
  /** Distinct cities present in the company's jobs (option list for Location). */
  locations: { id: number; name: string }[];
  /** Distinct teammates who have posted a job (option list for Posted By). */
  posters: { id: number; name: string }[];
}

// Order the Status dropdown sensibly (Open first). PENDING_MODERATION only
// appears when moderation is enabled (OFF on Day 0) — kept for exhaustiveness.
const STATUS_ORDER: JobStatus[] = ['ACTIVE', 'PENDING_MODERATION', 'DRAFT', 'EXPIRED', 'CLOSED'];
const CATEGORY_ORDER: JobCategory[] = ['FREE', 'HOT_VACANCY', 'SMB', 'INTERNSHIP'];

// `appearance-none` (+ our own chevron) so the token background/foreground fully
// control the control in BOTH themes — a native-styled <select> lets the UA
// paint its own (light) background in dark mode. Mirrors packages/ui `Select`.
const SELECT_CLASS =
  'h-9 w-full appearance-none rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] pl-3 pr-9 text-sm text-[var(--color-fg)] ' +
  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)] ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Filters & Search bar for the recruiter Jobs list. Fully URL/searchParams-driven
 * (mirroring the retired JobsStatusFilter) so it composes with the page's
 * server-side pagination: every control writes a query param and always resets
 * `page`. The parent RSC re-reads the params and re-queries Prisma.
 *
 * Params: `q` (title or numeric Job ID), `status`, `category` (jobType),
 * `city` (primaryCityId), `postedBy` (postedById).
 */
export function JobsFilterBar({ locations, posters }: JobsFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const searchInputId = useId();
  const statusId = useId();
  const categoryId = useId();
  const locationId = useId();
  const postedByFieldId = useId();

  const status = searchParams.get('status') ?? '';
  const category = searchParams.get('category') ?? '';
  const city = searchParams.get('city') ?? '';
  const postedBy = searchParams.get('postedBy') ?? '';
  const urlQuery = searchParams.get('q') ?? '';

  // Latest searchParams, read at debounce-fire time (not the render-time
  // snapshot) so a trailing search commit MERGES with — rather than clobbers —
  // a dropdown change the user made during the debounce window.
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  // The search box is a controlled client input debounced into the URL, so it
  // keeps focus + cursor while the RSC re-renders. The URL stays the source of
  // truth, but we only re-sync the input on a GENUINE external change (Clear
  // all, back/forward) — tracked via the last value THIS component committed —
  // so the URL catching up to the user's own typing never reverts the input
  // (which would strip trailing spaces / jump the caret).
  const [query, setQuery] = useState(urlQuery);
  const lastCommittedQueryRef = useRef(urlQuery);
  useEffect(() => {
    if (urlQuery !== lastCommittedQueryRef.current) {
      lastCommittedQueryRef.current = urlQuery;
      setQuery(urlQuery);
    }
  }, [urlQuery]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const anyActive = Boolean(status || category || city || postedBy || urlQuery);

  function commit(params: URLSearchParams) {
    params.delete('page'); // any filter/search change returns to page 1
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParamsRef.current.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    commit(params);
  }

  function onSearchChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const trimmed = value.trim();
      lastCommittedQueryRef.current = trimmed;
      setParam('q', trimmed);
    }, SEARCH_DEBOUNCE_MS);
  }

  function clearAll() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    lastCommittedQueryRef.current = '';
    setQuery('');
    router.replace(pathname, { scroll: false });
  }

  return (
    <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
      {/* Search — matches by job title or, for a numeric query, Job ID. */}
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-fg-subtle)]"
        />
        <Input
          id={searchInputId}
          type="search"
          value={query}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by job title or ID…"
          aria-label="Search jobs by title or ID"
          className="pl-9 pr-9 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-[var(--color-fg-subtle)] transition-colors hover:text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Filter dropdowns */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <FilterSelect
          id={statusId}
          label="Status"
          value={status}
          onChange={(v) => setParam('status', v)}
        >
          <option value="">All statuses</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {JOB_STATUS_META[s].label}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          id={categoryId}
          label="Category"
          value={category}
          onChange={(v) => setParam('category', v)}
        >
          <option value="">All categories</option>
          {CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>
              {JOB_TYPE_LABELS[c]}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          id={locationId}
          label="Location"
          value={city}
          onChange={(v) => setParam('city', v)}
          disabled={locations.length === 0}
        >
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          id={postedByFieldId}
          label="Posted by"
          value={postedBy}
          onChange={(v) => setParam('postedBy', v)}
          disabled={posters.length === 0}
        >
          <option value="">All recruiters</option>
          {posters.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </FilterSelect>
      </div>

      {anyActive && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={clearAll}
            className="rounded text-xs font-medium text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={SELECT_CLASS}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden
          className={cn(
            'pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-fg-subtle)]',
            disabled && 'opacity-50',
          )}
        />
      </div>
    </div>
  );
}
