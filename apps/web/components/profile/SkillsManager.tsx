'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Input } from '@jobportal/ui';
import { api } from '../../lib/profile/api-client';

interface SkillEntry {
  id: number;
  slug: string;
  name: string;
  category: string | null;
}

export function SkillsManager({
  initialSelected,
  catalogue,
}: {
  initialSelected: number[];
  catalogue: SkillEntry[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set(initialSelected));
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalogue.slice(0, 100);
    return catalogue.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 100);
  }, [query, catalogue]);

  function toggle(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await api('/me/skills', {
      method: 'PATCH',
      body: JSON.stringify({ skillIds: [...selected] }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  const selectedEntries = catalogue.filter((s) => selected.has(s.id));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm text-[var(--color-fg-muted)]">Selected ({selectedEntries.length})</p>
        <div className="flex flex-wrap gap-1.5 rounded-md border border-[var(--color-border)] p-3 min-h-[3.5rem]">
          {selectedEntries.length === 0 ? (
            <p className="text-sm text-[var(--color-fg-subtle)]">Nothing selected yet.</p>
          ) : (
            selectedEntries.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggle(s.id)}
                className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
                aria-label={`Remove ${s.name}`}
              >
                <Badge variant="primary">{s.name} ×</Badge>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Input
          placeholder="Search skills…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex flex-wrap gap-1.5">
          {filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
              aria-pressed={selected.has(s.id)}
            >
              <Badge variant={selected.has(s.id) ? 'primary' : 'neutral'}>{s.name}</Badge>
            </button>
          ))}
        </div>
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
