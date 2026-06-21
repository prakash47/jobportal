'use client';

import { useState, type KeyboardEvent } from 'react';
import { Badge, Button, Input } from '@jobportal/ui';
import { Plus, Trash2 } from '@jobportal/ui/icons';
import { apiSend } from './api';
import { SegmentedControl } from './SegmentedControl';

export type Proficiency = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export interface LanguageItem {
  id: number;
  name: string;
  proficiency: Proficiency;
}

const LEVELS = [
  { value: 'BEGINNER', label: 'Beginner' },
  { value: 'INTERMEDIATE', label: 'Intermediate' },
  { value: 'ADVANCED', label: 'Advanced' },
] as const;

// Languages sub-collection: name + proficiency, added immediately (POST
// /me/languages) and listed with delete. Mirrors the reference's add-to-list UX.
// The list is controlled by the wizard so it survives the step's remount on nav.
export function LanguagesEditor({
  items,
  onItemsChange,
}: {
  items: LanguageItem[];
  onItemsChange: (next: LanguageItem[]) => void;
}) {
  const [name, setName] = useState('');
  const [proficiency, setProficiency] = useState<Proficiency>('BEGINNER');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const n = name.trim();
    if (!n) {
      setError('Please enter a language.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await apiSend<LanguageItem>('/me/languages', 'POST', { name: n, proficiency });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onItemsChange([...items, res.data]);
    setName('');
    setProficiency('BEGINNER');
  }

  async function remove(id: number) {
    const prev = items;
    onItemsChange(items.filter((x) => x.id !== id));
    const res = await apiSend(`/me/languages/${id}`, 'DELETE');
    if (!res.ok) onItemsChange(prev);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void add();
    }
  }

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {items.map((l) => (
            <li
              key={l.id}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] py-1.5 pl-3 pr-1.5"
            >
              <span className="text-sm font-medium text-[var(--color-fg)]">{l.name}</span>
              <Badge variant="neutral">
                {LEVELS.find((x) => x.value === l.proficiency)?.label}
              </Badge>
              <button
                type="button"
                onClick={() => remove(l.id)}
                aria-label={`Remove ${l.name}`}
                className="rounded-md p-1 text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-danger)]"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 rounded-lg border border-[var(--color-border)] p-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={onKeyDown}
          maxLength={60}
          placeholder="Language (e.g. Hindi)"
          aria-label="Language name"
        />
        <SegmentedControl
          options={LEVELS}
          value={proficiency}
          onChange={(v) => setProficiency(v as Proficiency)}
          ariaLabel="Proficiency"
          size="sm"
        />
        {error && (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}
        <Button type="button" onClick={add} loading={busy} leadingIcon={<Plus className="size-4" />} className="w-full">
          Add language
        </Button>
      </div>
    </div>
  );
}
