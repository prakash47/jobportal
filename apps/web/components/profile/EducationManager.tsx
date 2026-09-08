'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Checkbox, Input, Label, cn } from '@jobportal/ui';
import { Plus, Trash2 } from '@jobportal/ui/icons';
import { api } from '../../lib/profile/api-client';
import { FieldSelect } from '../onboarding/FieldSelect';
import { SectionHeading } from '../onboarding/SectionHeading';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { CLASS12_DEGREE } from '../onboarding/education-constants';
import {
  emptyEduDraft,
  endYearOptions,
  isBlank,
  startYearOptions,
  toEducationBody,
  validateEduDraft,
  type EduDraft,
} from '../../lib/profile/education';

export interface EducationManagerProps {
  currentYear: number;
  /** Every non-Class-12 qualification, newest first. */
  qualifications: EduDraft[];
  class12: EduDraft;
}

/** Local key so a new, unsaved card has a stable React identity before it has an id. */
interface Keyed {
  key: string;
  draft: EduDraft;
}

let nextKey = 0;
const keyed = (draft: EduDraft): Keyed => ({ key: `edu-${nextKey++}`, draft });

/**
 * The dashboard education editor.
 *
 * Replaces the fixed "one degree + Class 12" form. `Education` already allowed
 * many rows per candidate — nothing but the UI was stopping a candidate from
 * recording a post-graduation, a diploma and an SSC, so this is a UI change with
 * no migration behind it.
 *
 * The Class 12 section stays separate rather than becoming another card: its
 * fields are genuinely different (School name, Stream), it is discriminated in
 * the database by the CLASS12_DEGREE sentinel, and the onboarding wizard writes
 * the same shape.
 */
export function EducationManager({
  currentYear,
  qualifications: initialQualifications,
  class12: initialClass12,
}: EducationManagerProps) {
  const router = useRouter();
  const [rows, setRows] = useState<Keyed[]>(
    initialQualifications.length > 0
      ? initialQualifications.map(keyed)
      : // Always show one card, so an empty profile has somewhere to type.
        [keyed(emptyEduDraft)],
  );
  const [class12, setClass12] = useState<EduDraft>(initialClass12);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<Keyed | null>(null);

  const startYears = startYearOptions(currentYear);
  const endYears = endYearOptions(currentYear);

  function patchRow(key: string, patch: Partial<EduDraft>) {
    setRows((current) =>
      current.map((r) => (r.key === key ? { ...r, draft: { ...r.draft, ...patch } } : r)),
    );
    setSaved(false);
  }

  function addDegree() {
    setRows((current) => [...current, keyed(emptyEduDraft)]);
    setSaved(false);
  }

  async function removeRow(row: Keyed) {
    setPendingRemoval(null);
    // A card that was never saved has no row to delete — just drop it.
    if (row.draft.id === null) {
      setRows((current) => current.filter((r) => r.key !== row.key));
      return;
    }
    setBusy(true);
    const res = await api(`/me/education/${row.draft.id}`, { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setRows((current) => current.filter((r) => r.key !== row.key));
    router.refresh();
  }

  /** Upsert one section. Blank sections are skipped, not rejected. */
  async function saveDraft(draft: EduDraft, degreeName: string): Promise<number | null | false> {
    if (isBlank(draft)) return null;
    const body = toEducationBody(draft, degreeName);
    if (draft.id !== null) {
      const res = await api(`/me/education/${draft.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      if (!res.ok) {
        setError(res.message);
        return false;
      }
      return draft.id;
    }
    const res = await api<{ id: number }>('/me/education', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError(res.message);
      return false;
    }
    return res.data.id;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    // Validate everything BEFORE writing anything. Validating as we go would
    // leave the earlier cards saved and the later ones not, with an error
    // message that makes it look as though nothing was written.
    for (const [i, row] of rows.entries()) {
      const message = validateEduDraft(row.draft, {
        label: rows.length === 1 ? 'Qualification' : `Qualification ${i + 1}`,
        requireDegreeName: true,
        class12Sentinel: CLASS12_DEGREE,
      });
      if (message) {
        setError(message);
        return;
      }
    }
    const class12Message = validateEduDraft(class12, {
      label: 'Class 12',
      requireDegreeName: false,
      class12Sentinel: CLASS12_DEGREE,
    });
    if (class12Message) {
      setError(class12Message);
      return;
    }

    setBusy(true);
    for (const row of rows) {
      const result = await saveDraft(row.draft, row.draft.degree.trim());
      if (result === false) {
        setBusy(false);
        return;
      }
      if (result !== null && row.draft.id === null) {
        // Adopt the new id so a second save PATCHes instead of inserting a duplicate.
        patchRow(row.key, { id: result });
      }
    }
    const c12 = await saveDraft(class12, CLASS12_DEGREE);
    setBusy(false);
    if (c12 === false) return;
    if (c12 !== null && class12.id === null) setClass12((c) => ({ ...c, id: c12 }));

    setSaved(true);
    router.refresh();
  }

  return (
    <>
      <form onSubmit={onSubmit} className="space-y-7">
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionHeading>Qualifications</SectionHeading>
            <span className="text-xs text-[var(--color-fg-muted)]">
              {rows.length === 1 ? '1 qualification' : `${rows.length} qualifications`}
            </span>
          </div>

          {rows.map((row, i) => (
            <div
              key={row.key}
              className="space-y-4 rounded-lg border border-[var(--color-border)] p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-[var(--color-fg)]">
                  {row.draft.degree.trim() || `Qualification ${i + 1}`}
                </p>
                {/* The only card left is not removable — removing it would leave
                    nowhere to type, and "clear the fields" is what they want. */}
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setPendingRemoval(row)}
                    aria-label={`Remove ${row.draft.degree.trim() || `qualification ${i + 1}`}`}
                    className="rounded-md p-1.5 text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  id={`${row.key}-name`}
                  label="Degree name"
                  value={row.draft.degree}
                  onChange={(v) => patchRow(row.key, { degree: v })}
                  maxLength={120}
                  placeholder="e.g. B.Tech, M.Tech, Diploma"
                />
                <TextField
                  id={`${row.key}-spec`}
                  label="Specialization"
                  value={row.draft.fieldOfStudy}
                  onChange={(v) => patchRow(row.key, { fieldOfStudy: v })}
                  maxLength={120}
                  placeholder="e.g. Computer Science"
                />
              </div>
              <TextField
                id={`${row.key}-college`}
                label="College name"
                value={row.draft.institute}
                onChange={(v) => patchRow(row.key, { institute: v })}
                maxLength={200}
                placeholder="e.g. IIT Bombay"
              />
              <div className="grid gap-4 sm:grid-cols-3">
                <YearField
                  id={`${row.key}-start`}
                  label="Starting year"
                  value={row.draft.startYear}
                  onChange={(v) => patchRow(row.key, { startYear: v })}
                  years={startYears}
                />
                <YearField
                  id={`${row.key}-end`}
                  label="Ending year"
                  value={row.draft.pursuing ? '' : row.draft.endYear}
                  onChange={(v) => patchRow(row.key, { endYear: v })}
                  years={endYears}
                  disabled={row.draft.pursuing}
                />
                <TextField
                  id={`${row.key}-grade`}
                  label="CGPA / Percentage"
                  value={row.draft.grade}
                  onChange={(v) => patchRow(row.key, { grade: v })}
                  maxLength={40}
                  placeholder="e.g. 8.5"
                />
              </div>
              <PursuingToggle
                id={`${row.key}-pursuing`}
                checked={row.draft.pursuing}
                onChange={(c) => patchRow(row.key, { pursuing: c })}
              />
            </div>
          ))}

          <Button
            type="button"
            variant="secondary"
            onClick={addDegree}
            leadingIcon={<Plus className="size-4" aria-hidden="true" />}
          >
            Add another degree
          </Button>
        </section>

        <div className="border-t border-[var(--color-border)]" />

        <section className="space-y-4">
          <SectionHeading>Class 12 information</SectionHeading>
          <TextField
            id="c12-school"
            label="School / College name"
            value={class12.institute}
            onChange={(v) => setClass12((c) => ({ ...c, institute: v }))}
            maxLength={200}
            placeholder="e.g. Delhi Public School"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="c12-stream"
              label="Specialization / Stream"
              value={class12.fieldOfStudy}
              onChange={(v) => setClass12((c) => ({ ...c, fieldOfStudy: v }))}
              maxLength={120}
              placeholder="e.g. Science (PCM)"
            />
            {/* Reported as missing: the section collected years and a school but
                no result at all, so a Class 12 entry said nothing about how the
                candidate actually did. */}
            <TextField
              id="c12-marks"
              label="Marks / Percentage"
              value={class12.grade}
              onChange={(v) => setClass12((c) => ({ ...c, grade: v }))}
              maxLength={40}
              placeholder="e.g. 92% or 9.2 CGPA"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <YearField
              id="c12-start"
              label="Starting year"
              value={class12.startYear}
              onChange={(v) => setClass12((c) => ({ ...c, startYear: v }))}
              years={startYears}
            />
            <YearField
              id="c12-end"
              label="Ending year"
              value={class12.pursuing ? '' : class12.endYear}
              onChange={(v) => setClass12((c) => ({ ...c, endYear: v }))}
              years={endYears}
              disabled={class12.pursuing}
            />
          </div>
          <PursuingToggle
            id="c12-pursuing"
            checked={class12.pursuing}
            onChange={(c) => setClass12((s) => ({ ...s, pursuing: c }))}
          />
        </section>

        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-border)] pt-6">
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

      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null);
        }}
        title="Remove this qualification?"
        description={
          pendingRemoval && pendingRemoval.draft.id !== null
            ? `"${pendingRemoval.draft.degree.trim() || 'This qualification'}" will be deleted from your profile. This cannot be undone.`
            : 'This card has not been saved yet, so nothing will be deleted from your profile.'
        }
        confirmLabel="Remove"
        onConfirm={() => {
          if (pendingRemoval) void removeRow(pendingRemoval);
        }}
      />
    </>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  maxLength,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...(maxLength !== undefined ? { maxLength } : {})}
        {...(placeholder !== undefined ? { placeholder } : {})}
      />
    </div>
  );
}

function YearField({
  id,
  label,
  value,
  onChange,
  years,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  years: number[];
  disabled?: boolean;
}) {
  // Guarantee the controlled value always has a matching <option>: a year saved
  // before this range tightened would otherwise render a silently-blank select.
  const numValue = value !== '' ? Number(value) : null;
  const rendered = numValue !== null && !years.includes(numValue) ? [numValue, ...years] : years;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <FieldSelect
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">Year</option>
        {rendered.map((y) => (
          <option key={y} value={String(y)}>
            {y}
          </option>
        ))}
      </FieldSelect>
    </div>
  );
}

function PursuingToggle({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(c) => onChange(c === true)} />
      <Label
        htmlFor={id}
        className={cn('cursor-pointer text-sm font-normal text-[var(--color-fg-muted)]')}
      >
        Currently pursuing
      </Label>
    </div>
  );
}
