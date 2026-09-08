'use client';

import { useMemo, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Input, cn } from '@jobportal/ui';
import { Plus, Search, X } from '@jobportal/ui/icons';
import { api } from '../../lib/profile/api-client';
import {
  groupByCategory,
  MAX_SKILLS,
  resolveTypedSkill,
  searchSkills,
  type SkillEntry,
} from '../../lib/profile/skills';

/** A skill the user typed that is not in the catalogue yet. */
interface CustomSkill {
  name: string;
}

export function SkillsManager({
  initialSelected,
  catalogue,
}: {
  initialSelected: number[];
  catalogue: SkillEntry[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<number[]>(initialSelected);
  const [customs, setCustoms] = useState<CustomSkill[]>([]);
  const [query, setQuery] = useState('');
  const [browsing, setBrowsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const byId = useMemo(() => new Map(catalogue.map((s) => [s.id, s])), [catalogue]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedEntries = useMemo(
    () => selected.map((id) => byId.get(id)).filter((s): s is SkillEntry => s !== undefined),
    [selected, byId],
  );
  const totalCount = selectedEntries.length + customs.length;
  const atCap = totalCount >= MAX_SKILLS;

  // The pool is EMPTY until the user types. Rendering 100 chips by default was
  // the reported problem: an undifferentiated wall nobody can scan.
  const matches = useMemo(() => searchSkills(catalogue, query), [catalogue, query]);
  const typed = useMemo(() => resolveTypedSkill(catalogue, query), [catalogue, query]);
  const groupedMatches = useMemo(() => groupByCategory(matches), [matches]);
  const groupedAll = useMemo(() => groupByCategory(catalogue), [catalogue]);

  const alreadyCustom = (name: string) =>
    customs.some((c) => c.name.toLowerCase() === name.toLowerCase());

  function markDirty() {
    setSaved(false);
    setError(null);
  }

  function toggle(id: number) {
    markDirty();
    setSelected((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : atCap
          ? current
          : [...current, id],
    );
  }

  function addTyped() {
    if (typed.kind === 'empty') return;
    markDirty();
    if (typed.kind === 'existing') {
      if (!selectedSet.has(typed.skill.id) && !atCap) {
        setSelected((current) => [...current, typed.skill.id]);
      }
    } else if (!alreadyCustom(typed.name) && !atCap) {
      setCustoms((current) => [...current, { name: typed.name }]);
    }
    setQuery('');
  }

  function removeCustom(name: string) {
    markDirty();
    setCustoms((current) => current.filter((c) => c.name !== name));
  }

  function clearAll() {
    markDirty();
    setSelected([]);
    setCustoms([]);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTyped();
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    // customSkills are find-or-created server-side and returned as ids, so the
    // next load shows them as ordinary catalogue chips.
    const res = await api<{ skillIds: number[] }>('/me/skills', {
      method: 'PATCH',
      body: JSON.stringify({
        skillIds: selected,
        ...(customs.length > 0 ? { customSkills: customs.map((c) => c.name) } : {}),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setSelected(res.data.skillIds);
    setCustoms([]);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-[var(--color-fg)]">Selected ({totalCount})</p>
          {totalCount > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="rounded text-sm font-medium text-[var(--color-fg-muted)] underline underline-offset-2 transition-colors hover:text-[var(--color-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="flex min-h-[3.5rem] flex-wrap gap-1.5 rounded-md border border-[var(--color-border)] p-3">
          {totalCount === 0 ? (
            <p className="text-sm text-[var(--color-fg-subtle)]">Nothing selected yet.</p>
          ) : (
            <>
              {selectedEntries.map((s) => (
                <SelectedChip key={s.id} label={s.name} onRemove={() => toggle(s.id)} />
              ))}
              {customs.map((c) => (
                <SelectedChip
                  key={`custom-${c.name}`}
                  label={c.name}
                  isNew
                  onRemove={() => removeCustom(c.name)}
                />
              ))}
            </>
          )}
        </div>
        {atCap && (
          <p className="text-xs text-[var(--color-fg-muted)]">
            {MAX_SKILLS} is the maximum. Remove one to add another.
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-fg-muted)]"
            aria-hidden="true"
          />
          <Input
            id="skill-search"
            className="pl-9"
            placeholder="Search skills, or type your own and press Enter…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Search skills"
          />
        </div>

        {/* Free-text entry. The API find-or-creates a catalogue row, so a skill
            we have never heard of is still selectable — previously the only way
            in was to find it in the wall of chips, which meant an unlisted
            skill could not be added at all. */}
        {typed.kind === 'new' && !alreadyCustom(typed.name) && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={addTyped}
            disabled={atCap}
            leadingIcon={<Plus className="size-4" aria-hidden="true" />}
          >
            Add &ldquo;{typed.name}&rdquo; as a skill
          </Button>
        )}

        {query.trim() !== '' ? (
          groupedMatches.length > 0 ? (
            <SkillGroups
              groups={groupedMatches}
              isSelected={(id) => selectedSet.has(id)}
              onToggle={toggle}
            />
          ) : (
            typed.kind !== 'new' && (
              <p className="text-sm text-[var(--color-fg-muted)]">No skills match that name.</p>
            )
          )
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setBrowsing((b) => !b)}
              aria-expanded={browsing}
              className="rounded text-sm font-medium text-[var(--color-primary-600)] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
            >
              {browsing ? 'Hide the full list' : 'Or browse all skills by category'}
            </button>
            {browsing && (
              <SkillGroups
                groups={groupedAll}
                isSelected={(id) => selectedSet.has(id)}
                onToggle={toggle}
              />
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-[var(--color-border)] pt-6">
        <Button onClick={save} loading={busy}>
          Save skills
        </Button>
        {saved && <span className="text-sm text-[var(--color-success)]">Saved</span>}
        {error && (
          <span role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

function SelectedChip({
  label,
  isNew,
  onRemove,
}: {
  label: string;
  isNew?: boolean;
  onRemove: () => void;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border py-1 pl-2.5 pr-1 text-xs font-medium',
        isNew
          ? 'border-dashed border-[var(--color-primary-600)] text-[var(--color-primary-700)]'
          : 'border-[var(--color-border)] bg-[var(--color-bg-muted)] text-[var(--color-fg)]',
      )}
    >
      {label}
      {isNew && <span className="text-[10px] uppercase opacity-70">new</span>}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="rounded p-0.5 text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </span>
  );
}

function SkillGroups({
  groups,
  isSelected,
  onToggle,
}: {
  groups: ReturnType<typeof groupByCategory>;
  isSelected: (id: number) => boolean;
  onToggle: (id: number) => void;
}) {
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.label} className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">
            {group.label}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {group.skills.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onToggle(s.id)}
                className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
                aria-pressed={isSelected(s.id)}
              >
                <Badge variant={isSelected(s.id) ? 'primary' : 'neutral'}>{s.name}</Badge>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
