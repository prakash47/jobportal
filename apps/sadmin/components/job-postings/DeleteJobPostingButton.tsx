'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@jobportal/ui';
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * The Delete action on the Job Postings list and detail pages.
 *
 * Writes go through apps/api — never a server action or a Prisma call in the
 * RSC — so AdminGuard, the killswitch flag and the JOB_DELETED audit row all
 * apply, and so the Elasticsearch de-index and Cloudflare purge actually run.
 * lib/job-postings/queries.ts states the same rule from the read side.
 *
 * Three ways this refuses, each with its own message:
 *   - `blockedReason` set → the posting has applications. Rendered disabled;
 *     the API 409s anyway as the race-window backstop.
 *   - 503 → killswitch.admin_job_delete is ON.
 *   - 409 → an application arrived between the page render and the click.
 *
 * ⚠ The access_token cookie is HttpOnly and set on the sadmin origin, while the
 * API is a different origin — so this fetch MUST send credentials explicitly.
 * `credentials: 'include'` is what carries it; without it the call arrives
 * unauthenticated and AdminGuard 401s.
 */
export function DeleteJobPostingButton({
  jobId,
  title,
  blockedReason,
  killed,
  onDeleted,
}: {
  jobId: number;
  title: string;
  /** Non-null when the posting has applications — see canDeleteJobPosting. */
  blockedReason: string | null;
  /** True when killswitch.admin_job_delete is ON (the L2 half of the gate). */
  killed: boolean;
  /**
   * Where to go once the row is gone. The list passes nothing and gets a
   * refresh in place; the detail page passes its list href, because refreshing
   * a detail route whose row no longer exists renders a 404.
   */
  onDeleted?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  const disabled = blockedReason !== null || killed;
  // Self-describing out of context: a screen-reader user listing this page's
  // controls otherwise hears "Delete" twenty times with nothing to tell the rows
  // apart, and no hint of why some are unavailable.
  const label = killed
    ? `Delete ${title} — deletion is currently switched off`
    : blockedReason
      ? `Delete ${title} — ${blockedReason}`
      : `Delete ${title}`;

  async function onConfirm() {
    setError(null);
    setLoading(true);
    let res: Response;
    try {
      res = await fetch(`${API_URL}/admin/jobs/${jobId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
    } catch {
      setLoading(false);
      // fetch only rejects on a transport failure. Naming the URL turns
      // "something went wrong" into an actionable message during local
      // development, matching what lib/admin-api.ts does for the same case.
      setError(`Could not reach the API at ${API_URL}.`);
      return;
    }
    setLoading(false);

    if (!res.ok) {
      // Bespoke copy for the two refusals an admin can act on, rather than
      // surfacing the raw API sentence for every status.
      if (res.status === 409) {
        setError('This posting has applications now — close it instead of deleting it.');
      } else if (res.status === 503) {
        setError('Job deletion is currently switched off.');
      } else if (res.status === 404) {
        setError('This posting no longer exists.');
      } else if (res.status === 401) {
        setError('Your session has expired. Sign in again.');
      } else {
        const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
        setError(
          typeof body?.message === 'string' ? body.message : `Could not delete (${res.status}).`,
        );
      }
      return;
    }

    setOpen(false);
    startTransition(() => {
      // From the detail page the row is gone, so refreshing in place would
      // render a 404. Navigate back to the list and refresh THAT.
      if (onDeleted) router.replace(onDeleted);
      router.refresh();
    });
  }

  return (
    <>
      {/*
        `aria-disabled` rather than the `disabled` attribute when the posting has
        applications: `disabled` drops the control out of the tab order entirely,
        so a keyboard user cannot reach it and never learns why it is
        unavailable. Focusable and announced as unavailable is the treatment
        apps/recruiter's JobRowMenu and this console's own InertAction use.

        Deliberately NOT dimmed with `opacity`, which drops 14px muted text below
        legibility. The danger tone is earned only when the action can actually
        happen — a red control that refuses to fire promises something false.
      */}
      <button
        type="button"
        onClick={disabled ? undefined : () => setOpen(true)}
        aria-disabled={disabled || undefined}
        aria-label={label}
        {...(disabled ? { title: killed ? 'Deletion is switched off' : 'Has applications' } : {})}
        className={
          disabled
            ? 'cursor-not-allowed rounded font-medium text-[var(--color-fg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]'
            : 'rounded font-medium text-[var(--color-danger)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]'
        }
      >
        Delete
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{title}”?</DialogTitle>
            <DialogDescription>
              This permanently removes the posting for every user, and it cannot be undone. Anyone
              who saved it loses it from their saved list. If the job simply should not be visible
              anymore, close it instead — that keeps the record.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="danger" loading={loading} onClick={onConfirm}>
              Delete posting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
