'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Checkbox, Input, Label, Textarea, cn } from '@jobportal/ui';
import { Pencil, Plus, Trash2 } from '@jobportal/ui/icons';
import { api } from '../../lib/profile/api-client';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import {
  CAREER_BREAK_COMPANY,
  formatExperience,
  sortExperience,
  totalExperienceMonths,
} from '../../lib/profile/experience';

export interface ExperienceRow {
  id: number;
  companyName: string;
  title: string;
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
  isCareerBreak: boolean;
  description: string | null;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

/** ISO timestamp → the `YYYY-MM-DD` a date input expects. */
const toDateInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

interface Draft {
  companyName: string;
  title: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  isCareerBreak: boolean;
  description: string;
}

const emptyDraft: Draft = {
  companyName: '',
  title: '',
  startDate: '',
  endDate: '',
  isCurrent: false,
  isCareerBreak: false,
  description: '',
};

const draftFrom = (row: ExperienceRow): Draft => ({
  companyName: row.isCareerBreak ? '' : row.companyName,
  title: row.title,
  startDate: toDateInput(row.startDate),
  endDate: toDateInput(row.endDate),
  isCurrent: row.isCurrent,
  isCareerBreak: row.isCareerBreak,
  description: row.description ?? '',
});

export function ExperienceManager({ initial }: { initial: ExperienceRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<ExperienceRow[]>(initial);
  // null = closed, 'new' = the add form, a number = editing that row.
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<ExperienceRow | null>(null);

  // Sorted here as well as in the page query, so a row added or edited in this
  // session lands in the right place without a round-trip.
  const ordered = useMemo(() => sortExperience(rows), [rows]);
  const totalMonths = useMemo(() => totalExperienceMonths(rows), [rows]);

  function openAdd() {
    setDraft(emptyDraft);
    setError(null);
    setEditing('new');
  }

  function openEdit(row: ExperienceRow) {
    setDraft(draftFrom(row));
    setError(null);
    setEditing(row.id);
  }

  function closeForm() {
    setEditing(null);
    setDraft(emptyDraft);
    setError(null);
  }

  function patch(next: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...next }));
  }

  function validate(d: Draft): string | null {
    if (d.isCareerBreak) {
      if (!d.title.trim()) return 'Give the break a short reason, e.g. "Parental leave".';
    } else {
      if (!d.companyName.trim()) return 'Enter the company name.';
      if (!d.title.trim()) return 'Enter your title.';
    }
    if (!d.startDate) return 'Select a start date.';
    if (!d.isCurrent && !d.endDate) return 'Select an end date, or tick the ongoing box.';
    if (!d.isCurrent && d.endDate && d.endDate < d.startDate) {
      return 'The end date must be on or after the start date.';
    }
    return null;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const message = validate(draft);
    if (message) {
      setError(message);
      return;
    }
    setBusy(true);
    setError(null);

    const payload: Record<string, unknown> = {
      // A break has no employer, but companyName is non-null and is read by the
      // recruiter and admin apps — so it carries the constant label and the
      // reason lives in `title`. See the schema comment.
      companyName: draft.isCareerBreak ? CAREER_BREAK_COMPANY : draft.companyName.trim(),
      title: draft.title.trim(),
      startDate: new Date(draft.startDate).toISOString(),
      isCurrent: draft.isCurrent,
      isCareerBreak: draft.isCareerBreak,
    };
    // The API rejects an endDate alongside isCurrent, so it is omitted rather
    // than sent as null when the role is ongoing.
    if (!draft.isCurrent && draft.endDate) {
      payload['endDate'] = new Date(draft.endDate).toISOString();
    }
    if (draft.description.trim()) payload['description'] = draft.description.trim();

    const res =
      editing === 'new'
        ? await api<ExperienceRow>('/me/experience', {
            method: 'POST',
            body: JSON.stringify(payload),
          })
        : await api<ExperienceRow>(`/me/experience/${editing}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }

    setRows((current) =>
      editing === 'new'
        ? [...current, res.data]
        : current.map((r) => (r.id === editing ? res.data : r)),
    );
    closeForm();
    router.refresh();
  }

  async function remove(row: ExperienceRow) {
    setBusy(true);
    const res = await api(`/me/experience/${row.id}`, { method: 'DELETE' });
    setBusy(false);
    setPendingRemoval(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setRows((current) => current.filter((r) => r.id !== row.id));
    if (editing === row.id) closeForm();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Total experience, computed from the dates rather than typed. Overlapping
          roles are merged, and career breaks are excluded — see
          totalExperienceMonths. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
            Total experience
          </p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--color-fg)]">
            {formatExperience(totalMonths)}
          </p>
        </div>
        <p className="max-w-xs text-xs text-[var(--color-fg-muted)]">
          Calculated from your dates. Overlapping roles count once; career breaks are excluded.
        </p>
      </div>

      <ul className="space-y-3">
        {ordered.length === 0 && (
          <li className="rounded-md border border-dashed border-[var(--color-border)] p-6 text-sm text-[var(--color-fg-muted)]">
            No work experience added yet.
          </li>
        )}
        {ordered.map((r) => (
          <li
            key={r.id}
            className={cn(
              'flex items-start justify-between gap-4 rounded-md border p-4',
              r.isCareerBreak
                ? 'border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-muted)]'
                : 'border-[var(--color-border)]',
            )}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-[var(--color-fg)]">{r.title}</p>
                {r.isCareerBreak && <Badge variant="neutral">Career break</Badge>}
                {r.isCurrent && !r.isCareerBreak && <Badge variant="success">Current</Badge>}
              </div>
              {!r.isCareerBreak && (
                <p className="text-sm text-[var(--color-fg-muted)]">{r.companyName}</p>
              )}
              <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">
                {fmt(r.startDate)} – {r.isCurrent ? 'present' : r.endDate ? fmt(r.endDate) : '—'}
              </p>
              {r.description && (
                <p className="mt-2 whitespace-pre-line text-sm text-[var(--color-fg)]">
                  {r.description}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => openEdit(r)}
                aria-label={`Edit ${r.title}`}
                className="rounded-md p-1.5 text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
              >
                <Pencil className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setPendingRemoval(r)}
                aria-label={`Remove ${r.title}`}
                className="rounded-md p-1.5 text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {editing !== null ? (
        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-md border border-[var(--color-border)] p-4"
        >
          <p className="text-sm font-medium text-[var(--color-fg)]">
            {editing === 'new' ? 'Add experience' : 'Edit experience'}
          </p>

          <div className="flex items-center gap-2">
            <Checkbox
              id="exp-career-break"
              checked={draft.isCareerBreak}
              onCheckedChange={(v) => patch({ isCareerBreak: v === true })}
            />
            <Label htmlFor="exp-career-break" className="text-sm font-normal text-[var(--color-fg)]">
              This is a career break, not a role
            </Label>
          </div>
          {draft.isCareerBreak && (
            <p className="text-xs text-[var(--color-fg-muted)]">
              Recorded so a gap in your history has context. It does not count towards your total
              experience.
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {!draft.isCareerBreak && (
              <div className="space-y-1.5">
                <Label htmlFor="exp-company">Company</Label>
                <Input
                  id="exp-company"
                  value={draft.companyName}
                  onChange={(e) => patch({ companyName: e.target.value })}
                  maxLength={200}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="exp-title">{draft.isCareerBreak ? 'Reason' : 'Title'}</Label>
              <Input
                id="exp-title"
                value={draft.title}
                onChange={(e) => patch({ title: e.target.value })}
                maxLength={120}
                placeholder={draft.isCareerBreak ? 'e.g. Parental leave, Further study' : undefined}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-start">Start date</Label>
              <Input
                id="exp-start"
                type="date"
                value={draft.startDate}
                onChange={(e) => patch({ startDate: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-end">End date</Label>
              <Input
                id="exp-end"
                type="date"
                value={draft.isCurrent ? '' : draft.endDate}
                onChange={(e) => patch({ endDate: e.target.value })}
                disabled={draft.isCurrent}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="exp-current"
              checked={draft.isCurrent}
              onCheckedChange={(v) => patch({ isCurrent: v === true })}
            />
            <Label htmlFor="exp-current" className="text-sm text-[var(--color-fg)]">
              {draft.isCareerBreak ? 'This break is ongoing' : 'I currently work here'}
            </Label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="exp-description">Description</Label>
            <Textarea
              id="exp-description"
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
              rows={4}
              maxLength={2000}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" loading={busy}>
              {editing === 'new' ? 'Add' : 'Save changes'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={closeForm} disabled={busy}>
              Cancel
            </Button>
            {error && (
              <span role="alert" className="text-sm text-[var(--color-danger)]">
                {error}
              </span>
            )}
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            onClick={openAdd}
            leadingIcon={<Plus className="size-4" aria-hidden="true" />}
          >
            Add experience
          </Button>
          {error && (
            <span role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </span>
          )}
        </div>
      )}

      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null);
        }}
        busy={busy}
        title={pendingRemoval?.isCareerBreak ? 'Remove this career break?' : 'Remove this role?'}
        description={
          pendingRemoval
            ? `"${pendingRemoval.title}"${
                pendingRemoval.isCareerBreak ? '' : ` at ${pendingRemoval.companyName}`
              } will be deleted from your profile. This cannot be undone.`
            : ''
        }
        confirmLabel="Remove"
        onConfirm={() => {
          if (pendingRemoval) void remove(pendingRemoval);
        }}
      />
    </div>
  );
}
