'use client';

import { useMemo, useState } from 'react';
import { Badge, Input } from '@jobportal/ui';
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  isCriticalFlag,
  type AdminFeatureFlag,
} from '../../lib/admin/types';
import { FlagToggleRow } from './FlagToggleRow';
import { CriticalFlagConfirm } from './CriticalFlagConfirm';
import { FlagEditSidePanel, type PatchPayload } from './FlagEditSidePanel';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type StateFilter = 'all' | 'enabled' | 'disabled';

export function FeatureFlagsTable({ initial }: { initial: AdminFeatureFlag[] }) {
  const [flags, setFlags] = useState<AdminFeatureFlag[]>(initial);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [confirmFlag, setConfirmFlag] = useState<AdminFeatureFlag | null>(null);
  const [editFlag, setEditFlag] = useState<AdminFeatureFlag | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return flags.filter((f) => {
      if (stateFilter === 'enabled' && !f.enabled) return false;
      if (stateFilter === 'disabled' && f.enabled) return false;
      if (!q) return true;
      const haystack = `${f.key} ${f.uiLabel ?? ''} ${f.description ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [flags, search, stateFilter]);

  const grouped = useMemo(() => {
    const out = new Map<string, AdminFeatureFlag[]>();
    for (const f of filtered) {
      const cat = f.category ?? 'uncategorized';
      const list = out.get(cat) ?? [];
      list.push(f);
      out.set(cat, list);
    }
    // Order categories per CATEGORY_ORDER, then any unknown ones
    // alphabetically at the end.
    const ordered: Array<{ category: string; flags: AdminFeatureFlag[] }> = [];
    const seen = new Set<string>();
    for (const cat of CATEGORY_ORDER) {
      const list = out.get(cat);
      if (list) {
        ordered.push({ category: cat, flags: list });
        seen.add(cat);
      }
    }
    for (const [cat, list] of [...out].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (!seen.has(cat)) ordered.push({ category: cat, flags: list });
    }
    return ordered;
  }, [filtered]);

  async function patchFlag(
    key: string,
    patch: Partial<AdminFeatureFlag> & { reason?: string },
  ): Promise<void> {
    setPendingKey(key);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/admin/feature-flags/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `Update failed (${res.status})`);
      }
      const updated = (await res.json()) as AdminFeatureFlag;
      setFlags((prev) => prev.map((f) => (f.key === updated.key ? updated : f)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
      throw err;
    } finally {
      setPendingKey(null);
    }
  }

  function onToggle(flag: AdminFeatureFlag) {
    if (isCriticalFlag(flag.key)) {
      // Critical flags route through the confirmation dialog so the
      // admin has to enter a reason. The dialog itself calls patchFlag.
      setConfirmFlag(flag);
      return;
    }
    void patchFlag(flag.key, { enabled: !flag.enabled }).catch(() => {
      // Error state is captured in `error`; nothing more to do here.
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          placeholder="Search by key, label, or description"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div role="tablist" aria-label="Filter by state" className="flex gap-1.5">
          {(['all', 'enabled', 'disabled'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={stateFilter === s}
              onClick={() => setStateFilter(s)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                stateFilter === s
                  ? 'border-[var(--color-fg)] bg-[var(--color-fg)] text-[var(--color-bg)]'
                  : 'border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)]'
              }`}
            >
              {s === 'all' ? 'All' : s === 'enabled' ? 'Enabled' : 'Disabled'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-[var(--color-danger)] bg-[var(--color-bg-elevated)] px-4 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {grouped.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] p-10 text-center">
          <p className="text-sm font-medium text-[var(--color-fg)]">No flags match this filter</p>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Try clearing the search or switching state filter.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ category, flags: catFlags }) => (
            <section key={category}>
              <header className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
                  {CATEGORY_LABEL[category] ?? category}
                </h2>
                <Badge variant="neutral">{catFlags.length}</Badge>
              </header>
              <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-muted)] text-left text-xs font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">
                      <th className="px-4 py-2">Label</th>
                      <th className="px-4 py-2">Key</th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2">State</th>
                      <th className="px-4 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catFlags.map((f) => (
                      <FlagToggleRow
                        key={f.key}
                        flag={f}
                        pending={pendingKey === f.key}
                        onToggle={() => onToggle(f)}
                        onEdit={() => setEditFlag(f)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      {confirmFlag && (
        <CriticalFlagConfirm
          flag={confirmFlag}
          onCancel={() => setConfirmFlag(null)}
          onConfirm={async (reason) => {
            try {
              await patchFlag(confirmFlag.key, { enabled: !confirmFlag.enabled, reason });
              setConfirmFlag(null);
            } catch {
              // Error already surfaced via setError; keep dialog open so
              // the admin can retry without re-entering the reason.
            }
          }}
        />
      )}

      {editFlag && (
        <FlagEditSidePanel
          flag={editFlag}
          open
          onOpenChange={(open) => {
            if (!open) setEditFlag(null);
          }}
          onSave={async (patch: PatchPayload) => {
            await patchFlag(editFlag.key, patch);
            setEditFlag(null);
          }}
        />
      )}
    </div>
  );
}
