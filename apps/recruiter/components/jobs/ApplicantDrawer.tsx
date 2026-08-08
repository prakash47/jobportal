'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Label, Textarea } from '@jobportal/ui';
import { X } from '@jobportal/ui/icons';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type ApplicationStatus =
  | 'APPLIED'
  | 'IN_REVIEW'
  | 'SHORTLISTED'
  | 'INTERVIEWED'
  | 'OFFERED'
  | 'HIRED'
  | 'REJECTED'
  | 'WITHDRAWN';

const RECRUITER_NEXT: Record<ApplicationStatus, ApplicationStatus[]> = {
  APPLIED: ['IN_REVIEW', 'REJECTED'],
  IN_REVIEW: ['SHORTLISTED', 'REJECTED'],
  SHORTLISTED: ['INTERVIEWED', 'REJECTED'],
  INTERVIEWED: ['OFFERED', 'REJECTED'],
  OFFERED: ['HIRED', 'REJECTED'],
  HIRED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  APPLIED: 'Applied',
  IN_REVIEW: 'In review',
  SHORTLISTED: 'Shortlisted',
  INTERVIEWED: 'Interviewed',
  OFFERED: 'Offered',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};

export interface ApplicantDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicant: {
    id: number;
    status: ApplicationStatus;
    appliedAt: string;
    recruiterNotes: string | null;
    /** The resume SUBMITTED with this application (ADR 0002 decision 7).
     *  Null on rows that predate the column. Non-null means the recruiter can
     *  open it even if the candidate has since withdrawn their profile CV. */
    resumeId: number | null;
    user: {
      name: string;
      email: string;
      candidate: {
        headline: string | null;
        experienceMonths: number | null;
        currentTitle: string | null;
        expectedSalaryMinPaise: number | null;
        expectedSalaryMaxPaise: number | null;
        activeResumeId: number | null;
      } | null;
    };
  };
}

const fmtSalaryRange = (min: number | null, max: number | null): string => {
  const lpa = (paise: number) => Math.round(paise / 100 / 100_000);
  if (min !== null && max !== null) return `₹${lpa(min)}–${lpa(max)} LPA`;
  if (min !== null) return `₹${lpa(min)}+ LPA`;
  if (max !== null) return `up to ₹${lpa(max)} LPA`;
  return '—';
};

const fmtExperience = (months: number | null): string => {
  if (months === null) return '—';
  const years = Math.round((months / 12) * 10) / 10;
  return `${years} yr${years === 1 ? '' : 's'}`;
};

// Right-side drawer using Radix Dialog primitives with custom slide-in.
// Linear-style — generous padding, calm transitions, single Save button per
// notes (autosave on blur).
export function ApplicantDrawer({ open, onOpenChange, applicant }: ApplicantDrawerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState(applicant.recruiterNotes ?? '');
  const [savedNotes, setSavedNotes] = useState(applicant.recruiterNotes ?? '');

  // Re-sync local state when a different applicant is opened.
  useEffect(() => {
    setNotes(applicant.recruiterNotes ?? '');
    setSavedNotes(applicant.recruiterNotes ?? '');
    setError(null);
  }, [applicant.id, applicant.recruiterNotes]);

  const nextStatuses = RECRUITER_NEXT[applicant.status] ?? [];
  const candidate = applicant.user.candidate;

  async function transition(toStatus: ApplicationStatus) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_URL}/recruiter/applications/${applicant.id}/transition`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: toStatus }),
        },
      );
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(errBody.message ?? `Transition failed (${res.status})`);
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transition failed');
    } finally {
      setBusy(false);
    }
  }

  async function saveNotes() {
    if (notes === savedNotes) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/recruiter/applications/${applicant.id}/notes`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error(`Save notes failed (${res.status})`);
      setSavedNotes(notes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save notes failed');
    } finally {
      setBusy(false);
    }
  }

  async function openResume() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_URL}/recruiter/applications/${applicant.id}/resume`,
        { credentials: 'include' },
      );
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(errBody.message ?? 'No resume available');
      }
      const body = (await res.json()) as { url: string };
      window.open(body.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resume fetch failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          className="fixed inset-0 z-40 bg-black/30 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0"
        />
        <RadixDialog.Content
          className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col gap-6 overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right"
        >
          <header className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <RadixDialog.Title className="text-lg font-semibold tracking-tight text-[var(--color-fg)]">
                {applicant.user.name}
              </RadixDialog.Title>
              <p className="text-xs text-[var(--color-fg-muted)]">{applicant.user.email}</p>
              <Badge variant="neutral" className="mt-2">
                {STATUS_LABEL[applicant.status]}
              </Badge>
            </div>
            <RadixDialog.Close
              aria-label="Close"
              className="shrink-0 rounded-md text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
            >
              <X className="size-4" />
            </RadixDialog.Close>
          </header>

          <section className="space-y-3 border-t border-[var(--color-border)] pt-4">
            <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--color-fg-subtle)]">
              Profile
            </h3>
            <dl className="space-y-2 text-sm">
              <Field label="Headline" value={candidate?.headline ?? '—'} />
              <Field label="Current title" value={candidate?.currentTitle ?? '—'} />
              <Field label="Experience" value={fmtExperience(candidate?.experienceMonths ?? null)} />
              <Field
                label="Expected salary"
                value={fmtSalaryRange(
                  candidate?.expectedSalaryMinPaise ?? null,
                  candidate?.expectedSalaryMaxPaise ?? null,
                )}
              />
            </dl>
          </section>

          {/* Show the button whenever the API can actually serve something.
              The snapshot comes first: an application that recorded its resume
              stays openable even after the candidate withdraws that CV from
              their profile, which is precisely what decision 7 is for. Legacy
              rows carry no snapshot, so they still depend on the current CV. */}
          {(applicant.resumeId !== null ||
            (candidate?.activeResumeId !== null && candidate?.activeResumeId !== undefined)) && (
            <section className="border-t border-[var(--color-border)] pt-4">
              <Button variant="secondary" onClick={openResume} loading={busy}>
                Open resume (15-min link)
              </Button>
            </section>
          )}

          {nextStatuses.length > 0 && (
            <section className="space-y-2 border-t border-[var(--color-border)] pt-4">
              <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--color-fg-subtle)]">
                Move to
              </h3>
              <div className="flex flex-wrap gap-2">
                {nextStatuses.map((s) => (
                  <Button
                    key={s}
                    variant={s === 'REJECTED' ? 'ghost' : 'secondary'}
                    size="sm"
                    onClick={() => transition(s)}
                    loading={busy || pending}
                  >
                    {STATUS_LABEL[s]}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-[var(--color-fg-subtle)]">
                The candidate is emailed automatically.
              </p>
            </section>
          )}

          <section className="space-y-2 border-t border-[var(--color-border)] pt-4">
            <Label htmlFor="notes">Internal notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              rows={5}
              maxLength={5_000}
              placeholder="Recruiter-only. Auto-saves when you click outside."
            />
            {notes !== savedNotes && (
              <p className="text-xs text-[var(--color-fg-subtle)]">Unsaved changes — click outside to save.</p>
            )}
          </section>

          {error && (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
      <dt className="text-[var(--color-fg-muted)]">{label}</dt>
      <dd className="text-[var(--color-fg)]">{value}</dd>
    </div>
  );
}
