'use client';

import { useState } from 'react';
import Link from 'next/link';

export interface AuditLogEntry {
  id: number;
  flagId: number;
  flagKey: string;
  flagUiLabel: string | null;
  changedAt: string;
  changedBy: { id: number; name: string; email: string } | null;
  reason: string | null;
  before: unknown;
  after: unknown;
}

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

// One audit-log row. The diff column is a tiny human summary of what
// changed (e.g. "enabled: false → true"); clicking it expands the full
// before/after JSON in a sub-row. Heuristic-built diff over a JSON tree
// would be nicer but adds weight; this is enough for "what did the
// admin actually change."
export function AuditLogRow({ entry }: { entry: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const summary = summarizeDiff(entry.before, entry.after);

  return (
    <>
      <tr className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-bg-muted)]">
        <td className="px-4 py-2 align-top text-xs text-[var(--color-fg-muted)] tabular-nums">
          {dateFmt.format(new Date(entry.changedAt))}
        </td>
        <td className="px-4 py-2 align-top">
          {entry.changedBy ? (
            <div>
              <div className="text-[var(--color-fg)]">{entry.changedBy.name}</div>
              <div className="text-xs text-[var(--color-fg-muted)]">
                {entry.changedBy.email}
              </div>
            </div>
          ) : (
            <span className="text-xs text-[var(--color-fg-subtle)]">system</span>
          )}
        </td>
        <td className="px-4 py-2 align-top">
          <Link
            href={`/admin/audit-log?type=feature_flag&flagKey=${encodeURIComponent(entry.flagKey)}`}
            className="font-mono text-xs text-[var(--color-fg)] hover:underline"
          >
            {entry.flagKey}
          </Link>
          {entry.flagUiLabel && (
            <div className="text-xs text-[var(--color-fg-muted)]">{entry.flagUiLabel}</div>
          )}
        </td>
        <td className="px-4 py-2 align-top">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-left text-xs text-[var(--color-fg)] hover:underline"
            aria-expanded={expanded}
          >
            {summary || '(no field-level diff)'}
            <span className="ml-1 text-[var(--color-fg-muted)]">{expanded ? '▾' : '▸'}</span>
          </button>
        </td>
        <td className="px-4 py-2 align-top text-xs text-[var(--color-fg-muted)]">
          {entry.reason ?? '—'}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-muted)]">
          <td colSpan={5} className="px-4 py-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">
                  Before
                </div>
                <pre className="overflow-x-auto rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2 font-mono text-xs leading-relaxed text-[var(--color-fg)]">
                  {JSON.stringify(entry.before, null, 2)}
                </pre>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">
                  After
                </div>
                <pre className="overflow-x-auto rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2 font-mono text-xs leading-relaxed text-[var(--color-fg)]">
                  {JSON.stringify(entry.after, null, 2)}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Walk the top level of before/after and emit "key: <before> → <after>"
// for each key that changed. Skips lastChangedById and updatedAt because
// those flip on every change and aren't informative. Falls back to ''
// (caller renders "(no field-level diff)") if nothing meaningful
// differs.
const SKIP_KEYS = new Set(['lastChangedById', 'updatedAt', 'createdAt']);

function summarizeDiff(before: unknown, after: unknown): string {
  if (!isObj(before) || !isObj(after)) return '';
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const parts: string[] = [];
  for (const k of keys) {
    if (SKIP_KEYS.has(k)) continue;
    const a = before[k];
    const b = after[k];
    if (deepEq(a, b)) continue;
    parts.push(`${k}: ${preview(a)} → ${preview(b)}`);
  }
  return parts.join('  ·  ');
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEq(a[i], b[i])) return false;
    }
    return true;
  }
  return false;
}

function preview(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string') {
    const s = String(v);
    return s.length > 40 ? `${s.slice(0, 37)}…` : s;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    return `[${v.length}]`;
  }
  return JSON.stringify(v).slice(0, 40);
}
