'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  IconButton,
} from '@jobportal/ui';
import { Loader2, Plus, Users, X } from '@jobportal/ui/icons';
import { api } from '../../../lib/api-client';
import { PersonAvatar } from './PersonAvatar';

interface CollaboratorView {
  userId: number;
  name: string;
  image: string | null;
  designation: string | null;
}
interface CollaboratorsResponse {
  collaborators: CollaboratorView[];
  assignable: CollaboratorView[];
}

/**
 * Owner-only "Collaborate" control on the Job Detail Posted-By card (SRS §4.9).
 * Lists the job's current collaborators (with Remove) and the company teammates
 * who can still be added, driving the recruiter-job-collaborators API. After each
 * change it refetches and calls router.refresh() so the Posted-By card's avatar
 * row updates. The trigger + dialog are only rendered for the owner when the
 * collaborate killswitch is OFF (gated by the parent card).
 */
export function CollaborateDialog({
  jobId,
  jobTitle,
  hasCollaborators,
}: {
  jobId: number;
  jobTitle: string;
  hasCollaborators: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CollaboratorsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which teammate's row has an in-flight add/remove — drives its spinner and
  // disables the others so two mutations can't race.
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await api<CollaboratorsResponse>(`/recruiter/jobs/${jobId}/collaborators`);
    setLoading(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setData(res.data);
  }, [jobId]);

  useEffect(() => {
    if (open) {
      void load();
    } else {
      // Reset on close so a reopen starts clean.
      setData(null);
      setError(null);
      setBusyId(null);
    }
  }, [open, load]);

  async function add(userId: number) {
    setBusyId(userId);
    setError(null);
    const res = await api(`/recruiter/jobs/${jobId}/collaborators`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    setBusyId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    await load();
    router.refresh();
  }

  async function remove(userId: number) {
    setBusyId(userId);
    setError(null);
    const res = await api(`/recruiter/jobs/${jobId}/collaborators/${userId}`, { method: 'DELETE' });
    setBusyId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    await load();
    router.refresh();
  }

  const busy = busyId !== null;

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Users className="size-4" />
        {hasCollaborators ? 'Manage' : 'Collaborate'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Collaborate on this job</DialogTitle>
            <DialogDescription>
              Add teammates to &ldquo;{jobTitle}&rdquo; so they can help manage it and respond to
              applicants.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}

          {loading && !data ? (
            <div className="flex items-center justify-center gap-2 py-8 text-[var(--color-fg-muted)]">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              <span className="sr-only">Loading collaborators</span>
            </div>
          ) : data ? (
            <div className="space-y-5">
              <div>
                <p className="mb-2 text-xs font-medium text-[var(--color-fg-muted)]">Collaborators</p>
                {data.collaborators.length > 0 ? (
                  <ul className="space-y-1">
                    {data.collaborators.map((c) => (
                      <li key={c.userId} className="flex items-center gap-3 py-1.5">
                        <PersonAvatar name={c.name} image={c.image} size={32} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[var(--color-fg)]">
                            {c.name}
                          </p>
                          {c.designation && (
                            <p className="truncate text-xs text-[var(--color-fg-muted)]">
                              {c.designation}
                            </p>
                          )}
                        </div>
                        <IconButton
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove ${c.name}`}
                          disabled={busy}
                          onClick={() => remove(c.userId)}
                          icon={
                            busyId === c.userId ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <X className="size-4" />
                            )
                          }
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--color-fg-muted)]">No collaborators yet.</p>
                )}
              </div>

              <div className="border-t border-[var(--color-border)] pt-4">
                <p className="mb-2 text-xs font-medium text-[var(--color-fg-muted)]">Add a teammate</p>
                {data.assignable.length > 0 ? (
                  <ul className="space-y-1">
                    {data.assignable.map((t) => (
                      <li key={t.userId} className="flex items-center gap-3 py-1.5">
                        <PersonAvatar name={t.name} image={t.image} size={32} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[var(--color-fg)]">
                            {t.name}
                          </p>
                          {t.designation && (
                            <p className="truncate text-xs text-[var(--color-fg-muted)]">
                              {t.designation}
                            </p>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          loading={busyId === t.userId}
                          onClick={() => add(t.userId)}
                        >
                          <Plus className="size-4" />
                          Add
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--color-fg-muted)]">
                    {data.collaborators.length > 0
                      ? 'Everyone on your team is already a collaborator.'
                      : 'No other teammates in your company yet. Invite teammates from the Users page.'}
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
