'use client';

import { useState, type KeyboardEvent } from 'react';
import { Input } from '@jobportal/ui';
import { X } from '@jobportal/ui/icons';

// Free-text tag input (project tech stack). Type + Enter (or comma) commits a
// tag; Backspace on an empty field removes the last; blur commits a pending
// draft so a half-typed tag isn't lost when the user clicks Save.
export function TagInput({
  value,
  onChange,
  placeholder = 'Add and press Enter…',
  max = 30,
  maxLength = 40,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
  maxLength?: number;
}) {
  const [draft, setDraft] = useState('');
  const atMax = value.length >= max;

  function commit() {
    const t = draft.trim().slice(0, maxLength);
    setDraft('');
    if (!t || atMax) return;
    if (!value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
  }
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div>
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--color-bg-muted)] px-2.5 py-1 text-xs font-medium text-[var(--color-fg)]"
            >
              {t}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== t))}
                aria-label={`Remove ${t}`}
                className="text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={atMax ? 'Maximum reached' : placeholder}
        maxLength={maxLength}
        disabled={atMax}
      />
    </div>
  );
}
