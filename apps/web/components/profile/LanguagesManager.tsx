'use client';

import { useMemo, useState } from 'react';
import { Badge, Button, Checkbox, Label, cn } from '@jobportal/ui';
import { Plus, Trash2 } from '@jobportal/ui/icons';
import { api } from '../../lib/profile/api-client';
import { SingleCombobox } from '../ui/Combobox';
import {
  LANGUAGE_OPTIONS,
  PROFICIENCY_LEVELS,
  proficiencyLabel,
  type ProficiencyValue,
} from '../../lib/profile/catalogues';

export interface LanguageRow {
  id: number;
  name: string;
  proficiency: string;
  canRead: boolean;
  canWrite: boolean;
  canSpeak: boolean;
}

type SkillKey = 'canRead' | 'canWrite' | 'canSpeak';

const SKILLS: ReadonlyArray<{ key: SkillKey; label: string }> = [
  { key: 'canRead', label: 'Read' },
  { key: 'canWrite', label: 'Write' },
  { key: 'canSpeak', label: 'Speak' },
];

export function LanguagesManager({ initial }: { initial: LanguageRow[] }) {
  const [rows, setRows] = useState<LanguageRow[]>(initial);
  const [name, setName] = useState<string | null>(null);
  const [proficiency, setProficiency] = useState<ProficiencyValue>('INTERMEDIATE');
  const [skills, setSkills] = useState<Record<SkillKey, boolean>>({
    canRead: true,
    canWrite: true,
    canSpeak: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already-added languages are dropped from the picker rather than shown and
  // rejected: (candidateId, name) is unique, so offering one is offering a 409.
  const options = useMemo(() => {
    const taken = new Set(rows.map((r) => r.name.toLowerCase()));
    return LANGUAGE_OPTIONS.filter((o) => !taken.has(o.label.toLowerCase()));
  }, [rows]);

  const noSkillChecked = !skills.canRead && !skills.canWrite && !skills.canSpeak;

  async function add() {
    if (name === null) {
      setError('Pick a language first.');
      return;
    }
    if (noSkillChecked) {
      setError('Select at least one of read, write or speak.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await api<LanguageRow>('/me/languages', {
      method: 'POST',
      body: JSON.stringify({ name, proficiency, ...skills }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setRows([...rows, res.data]);
    setName(null);
    setProficiency('INTERMEDIATE');
    setSkills({ canRead: true, canWrite: true, canSpeak: true });
  }

  async function remove(id: number) {
    const previous = rows;
    // Optimistic: the row disappears immediately and comes back if the delete
    // fails, so a slow network does not look like a dead button.
    setRows(rows.filter((r) => r.id !== id));
    const res = await api(`/me/languages/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setRows(previous);
      setError(res.message);
    }
  }

  return (
    <div className="space-y-4">
      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-[var(--color-border)] px-3 py-2.5"
            >
              <span className="text-sm font-medium text-[var(--color-fg)]">{row.name}</span>
              <Badge variant="neutral">{proficiencyLabel(row.proficiency)}</Badge>
              <span className="text-xs text-[var(--color-fg-muted)]">
                {SKILLS.filter((s) => row[s.key])
                  .map((s) => s.label)
                  .join(' · ') || 'No skills listed'}
              </span>
              <button
                type="button"
                onClick={() => void remove(row.id)}
                aria-label={`Remove ${row.name}`}
                className="ml-auto rounded-md p-1.5 text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-4 rounded-lg border border-dashed border-[var(--color-border-strong)] p-4">
        <SingleCombobox
          id="language-name"
          label="Language"
          placeholder="Search languages…"
          options={options}
          value={name}
          onChange={setName}
          emptyLabel="No language matches — or it is already on your list"
        />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-[var(--color-fg)]">Proficiency</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {PROFICIENCY_LEVELS.map((level) => {
              const selected = proficiency === level.value;
              return (
                <button
                  key={level.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setProficiency(level.value)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
                    selected
                      ? 'border-[var(--color-primary-600)] bg-[var(--color-primary-50)]'
                      : 'border-[var(--color-border)] hover:bg-[var(--color-bg-muted)]',
                  )}
                >
                  <span
                    className={cn(
                      'block text-sm font-medium',
                      selected ? 'text-[var(--color-primary-700)]' : 'text-[var(--color-fg)]',
                    )}
                  >
                    {level.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--color-fg-muted)]">
                    {level.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-[var(--color-fg)]">What can you do?</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {SKILLS.map((skill) => (
              <div key={skill.key} className="flex items-center gap-2">
                <Checkbox
                  id={`language-${skill.key}`}
                  checked={skills[skill.key]}
                  onCheckedChange={(checked) =>
                    setSkills({ ...skills, [skill.key]: checked === true })
                  }
                />
                <Label htmlFor={`language-${skill.key}`} className="text-sm font-normal">
                  {skill.label}
                </Label>
              </div>
            ))}
          </div>
          {noSkillChecked && (
            <p className="text-xs text-[var(--color-danger)]">
              Pick at least one — a language with none of the three says nothing.
            </p>
          )}
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void add()}
            loading={busy}
            disabled={name === null || noSkillChecked}
            leadingIcon={<Plus className="size-4" aria-hidden="true" />}
          >
            Add language
          </Button>
          {error && (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}
        </div>
        <p className="text-xs text-[var(--color-fg-subtle)]">
          Languages save as you add them — the Save button below is for the fields above.
        </p>
      </div>
    </div>
  );
}
