'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Checkbox, cn, toast } from '@jobportal/ui';
import { SavedJobRow, type SavedJobRowData } from './SavedJobRow';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Owns the two things the server rows cannot: which rows are selected, and the
// undo affordance after a removal.
//
// WHY REMOVAL IS UNDO RATHER THAN A CONFIRMATION DIALOG. The report offered
// either. Un-saving a job is low-stakes, instantly reversible and something a
// candidate does repeatedly while triaging a list — putting a modal in front of
// every one would make the common path slower to punish a rare mistake, which
// is the trade a confirm dialog is only worth making when the action is
// destructive or irreversible. Sign-out got a dialog because you cannot
// un-sign-out; this gets an undo because you can just put it back. The undo is
// a real re-save (POST), not a local rollback, so it survives a refresh.

export interface SavedJobsListProps {
  rows: SavedJobRowData[];
}

export function SavedJobsList({ rows }: SavedJobsListProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [busy, setBusy] = useState(false);

  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggleOne(jobId: number, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(jobId);
      else next.delete(jobId);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.jobId)));
  }

  async function removeJobs(jobIds: number[]): Promise<number[]> {
    const removed: number[] = [];
    for (const jobId of jobIds) {
      const res = await fetch(`${API_URL}/me/saved-jobs/${jobId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      // 404 means it was already gone — the end state is what we wanted, so it
      // counts as removed rather than as a failure to report.
      if (res.ok || res.status === 404) removed.push(jobId);
    }
    return removed;
  }

  async function restoreJobs(jobIds: number[]): Promise<void> {
    for (const jobId of jobIds) {
      await fetch(`${API_URL}/me/saved-jobs/${jobId}`, {
        method: 'POST',
        credentials: 'include',
      });
    }
    startTransition(() => router.refresh());
  }

  async function handleRemove(jobIds: number[], label: string) {
    setBusy(true);
    try {
      const removed = await removeJobs(jobIds);
      if (removed.length === 0) {
        toast.error('Could not remove that. Please try again.');
        return;
      }
      setSelected(new Set());
      startTransition(() => router.refresh());
      toast(label, {
        action: {
          label: 'Undo',
          onClick: () => {
            void restoreJobs(removed);
          },
        },
      });
    } catch {
      toast.error('Could not remove that. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/*
        The bulk bar only exists once something is selected. A permanently
        visible "0 selected" bar would take vertical space from the list on
        every visit to serve an action most visits never use.
      */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-2.5">
          <span className="text-sm font-medium text-[var(--color-fg)]">
            {selected.size} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={toggleAll} disabled={busy}>
              {allSelected ? 'Clear selection' : 'Select all'}
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={busy}
              onClick={() =>
                void handleRemove(
                  [...selected],
                  `${selected.size} saved ${selected.size === 1 ? 'job' : 'jobs'} removed`,
                )
              }
            >
              Remove selected
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
        {/* Select-all lives in a header strip rather than the bulk bar, so it is
            reachable before anything is selected — otherwise selecting all
            requires first selecting one. */}
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2 sm:px-5">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleAll}
            aria-label={allSelected ? 'Clear selection' : 'Select all saved jobs on this page'}
            disabled={busy}
          />
          <span className="text-xs text-[var(--color-fg-muted)]">
            {allSelected ? 'All selected' : 'Select all'}
          </span>
        </div>

        <div className="divide-y divide-[var(--color-border)]">
          {rows.map((r) => (
            <SavedJobRow
              key={r.jobId}
              data={r}
              selected={selected.has(r.jobId)}
              onSelectedChange={(on) => toggleOne(r.jobId, on)}
              onRemove={() => void handleRemove([r.jobId], 'Saved job removed')}
              busy={busy}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export { cn };
