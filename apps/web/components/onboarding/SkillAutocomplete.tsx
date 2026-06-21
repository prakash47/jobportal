'use client';

import { useMemo, useState, type KeyboardEvent } from 'react';
import { Input } from '@jobportal/ui';
import { Plus, Search, X } from '@jobportal/ui/icons';

export interface SkillCatalogueItem {
  id: number;
  label: string;
}

// A selected skill is either a catalogue match (has id) or a free-text custom
// entry (no id). Custom entries are find-or-created server-side on save.
export interface SelectedSkill {
  id?: number;
  name: string;
}

// Skill picker with autosuggestion + custom entry. Typing filters the catalogue;
// if the text isn't in the list, "Add ‘…’" (or Enter) adds it as a custom skill.
// The suggestion list is inline (not an absolute popover) so it can't be clipped
// by the wizard card's overflow-hidden, and renders deterministically.
export function SkillAutocomplete({
  catalogue,
  value,
  onChange,
  max = 50,
}: {
  catalogue: readonly SkillCatalogueItem[];
  value: SelectedSkill[];
  onChange: (next: SelectedSkill[]) => void;
  max?: number;
}) {
  const [query, setQuery] = useState('');
  const atMax = value.length >= max;

  const selectedIds = new Set(value.filter((s) => s.id !== undefined).map((s) => s.id));
  const selectedNames = new Set(value.map((s) => s.name.toLowerCase()));
  const q = query.trim();
  const ql = q.toLowerCase();

  const suggestions = useMemo(
    () =>
      catalogue
        .filter((c) => !selectedIds.has(c.id) && (ql === '' || c.label.toLowerCase().includes(ql)))
        .slice(0, 60),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalogue, ql, value],
  );

  const exactCatalogue = catalogue.find((c) => c.label.toLowerCase() === ql);
  const canAddCustom = q !== '' && !selectedNames.has(ql) && exactCatalogue === undefined;

  function addCatalogue(item: SkillCatalogueItem) {
    if (atMax || selectedIds.has(item.id) || selectedNames.has(item.label.toLowerCase())) return;
    onChange([...value, { id: item.id, name: item.label }]);
    setQuery('');
  }
  function addCustom(name: string) {
    const trimmed = name.trim();
    if (!trimmed || atMax || selectedNames.has(trimmed.toLowerCase())) return;
    // Prefer the catalogue row if the typed text matches one exactly.
    const match = catalogue.find((c) => c.label.toLowerCase() === trimmed.toLowerCase());
    if (match) {
      addCatalogue(match);
      return;
    }
    onChange([...value, { name: trimmed }]);
    setQuery('');
  }
  function remove(skill: SelectedSkill) {
    onChange(value.filter((s) => !(s.name === skill.name && s.id === skill.id)));
  }
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (exactCatalogue) addCatalogue(exactCatalogue);
      else if (canAddCustom) addCustom(q);
    }
  }

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((s) => (
            <button
              key={`${s.id ?? 'c'}-${s.name}`}
              type="button"
              onClick={() => remove(s)}
              aria-label={`Remove ${s.name}`}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary-600)] px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-700)]"
            >
              {s.name}
              <X className="size-3.5" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-fg-subtle)]"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search or type a skill…"
          aria-label="Search or add a skill"
          className="pl-9"
          disabled={atMax}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-[var(--color-fg-muted)]">
        <span>
          {atMax ? 'Maximum reached — remove one to add another' : 'Pick from the list or add your own'}
        </span>
        <span>
          {value.length}/{max}
        </span>
      </div>

      {!atMax && (q !== '' || suggestions.length > 0) && (
        <div className="scrollbar-slim flex max-h-44 flex-col gap-1 overflow-y-auto rounded-lg border border-[var(--color-border)] p-2">
          {canAddCustom && (
            <button
              type="button"
              onClick={() => addCustom(q)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-[var(--color-primary-600)] transition-colors hover:bg-[var(--color-bg-muted)]"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add “{q}”
            </button>
          )}
          {suggestions.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => addCatalogue(c)}
              className="rounded-md px-2 py-1.5 text-left text-sm text-[var(--color-fg)] transition-colors hover:bg-[var(--color-bg-muted)]"
            >
              {c.label}
            </button>
          ))}
          {suggestions.length === 0 && !canAddCustom && (
            <p className="px-2 py-1.5 text-sm text-[var(--color-fg-muted)]">No matches.</p>
          )}
        </div>
      )}
    </div>
  );
}
