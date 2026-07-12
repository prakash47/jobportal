'use client';

import { useId, useMemo, useState } from 'react';
import { Button, Input, Label } from '@jobportal/ui';
import { JobStatusBadge, JOB_STATUS_META, type JobStatus } from './JobStatusBadge';

export interface PastJobSummary {
  id: number;
  title: string;
  status: JobStatus;
  cityName: string | null;
  postedLabel: string; // formatted server-side (fixed IST) to avoid hydration drift
}

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-3 text-sm';

interface TemplatePickerProps {
  pastJobs: PastJobSummary[];
  onSelect: (jobId: number) => void;
  onBack: () => void;
  loadingId: number | null;
  error: string | null;
}

// Indeed-style "start from a previous job". A searchable list of the
// recruiter's own past postings, narrowable by Status and Location; picking one
// deep-copies its content into the form (the parent fetches the full job).
export function TemplatePicker({ pastJobs, onSelect, onBack, loadingId, error }: TemplatePickerProps) {
  const searchId = useId();
  const statusId = useId();
  const locationId = useId();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<JobStatus | 'ALL'>('ALL');
  const [location, setLocation] = useState<string>('ALL');

  // Filter option lists derived from what the recruiter actually has.
  const statusOptions = useMemo(() => {
    const present = new Set(pastJobs.map((j) => j.status));
    return (Object.keys(JOB_STATUS_META) as JobStatus[]).filter((s) => present.has(s));
  }, [pastJobs]);

  const locationOptions = useMemo(() => {
    const present = new Set<string>();
    for (const j of pastJobs) if (j.cityName) present.add(j.cityName);
    return [...present].sort((a, b) => a.localeCompare(b));
  }, [pastJobs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pastJobs.filter((j) => {
      if (status !== 'ALL' && j.status !== status) return false;
      if (location !== 'ALL' && j.cityName !== location) return false;
      if (q && !j.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [pastJobs, query, status, location]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-[var(--color-fg)]">
          Start from a previous job
        </h2>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Pick one of your past postings to copy its details into a new job — then review and edit.
        </p>
      </div>

      {pastJobs.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] p-10 text-center">
          <p className="text-sm font-medium text-[var(--color-fg)]">No previous jobs yet</p>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Once you post a job it will show up here as a template.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_160px_180px]">
            <div className="space-y-1.5">
              <Label htmlFor={searchId}>Search</Label>
              <Input
                id={searchId}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={statusId}>Status</Label>
              <select
                id={statusId}
                value={status}
                onChange={(e) => setStatus(e.target.value as JobStatus | 'ALL')}
                className={SELECT_CLASS}
              >
                <option value="ALL">All statuses</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {JOB_STATUS_META[s].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={locationId}>Location</Label>
              <select
                id={locationId}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="ALL">All locations</option>
                {locationOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}

          {filtered.length === 0 ? (
            <p className="rounded-md border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-fg-muted)]">
              No jobs match these filters.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">
              {filtered.map((j) => (
                <li key={j.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--color-fg)]">{j.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--color-fg-muted)]">
                      <JobStatusBadge status={j.status} />
                      <span>{j.cityName ?? 'No location'}</span>
                      <span aria-hidden>·</span>
                      <span>{j.postedLabel}</span>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => onSelect(j.id)}
                    loading={loadingId === j.id}
                    disabled={loadingId !== null && loadingId !== j.id}
                  >
                    Use as template
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="border-t border-[var(--color-border)] pt-4">
        <Button variant="ghost" onClick={onBack} disabled={loadingId !== null}>
          ← Back
        </Button>
      </div>
    </div>
  );
}
