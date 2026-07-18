'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@jobportal/ui';
import { Copy, ExternalLink, Eye, Pencil, RotateCcw, Share2, Users, X } from '@jobportal/ui/icons';
import type { JobStatus } from '../JobStatusBadge';
import { JobStatusDialog } from '../JobStatusDialog';
import { ShareJobDialog } from '../ShareJobDialog';

type Dialog = 'share' | 'close' | 'reopen' | null;

/**
 * Prominent quick-action bar for the recruiter Job Detail page (SRS §4.9).
 * Mirrors the Jobs-list ⋮ menu's action set (View applicants · Edit · Share ·
 * Duplicate · Close/Reopen · View public page) and reuses its exact dialogs
 * (ShareJobDialog, JobStatusDialog) + hrefs, but rendered as buttons instead of
 * a popover menu. Status-gated the same way JobRowMenu is: Share only for a
 * live posting, Close for ACTIVE/EXPIRED, Reopen for CLOSED/EXPIRED.
 *
 * The detail page is owner-scoped (it 404s unless the viewer owns the job, or —
 * from PR B — collaborates on it), so every action here is always valid for the
 * viewer: no ownership gating is needed on the bar itself. Destructive Delete
 * and draft Publish deliberately stay in the ⋮ menu, not this prominent bar.
 */
export function JobQuickActions({
  id,
  title,
  status,
  publicUrl,
}: {
  id: number;
  title: string;
  status: JobStatus;
  /** Absolute seeker-site URL for the public posting (View public / Share). */
  publicUrl: string;
}) {
  const [dialog, setDialog] = useState<Dialog>(null);

  const isLive = status === 'ACTIVE';
  // Published at some point → seekers may hold the URL → "View public job page"
  // (the seeker page shows a closed/expired notice for non-live states). Never
  // published (draft / pending review) → "Preview" of the same page.
  const wasPublished = isLive || status === 'EXPIRED' || status === 'CLOSED';

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="primary">
          <Link href={`/jobs/${id}/applicants`}>
            <Users className="size-4" />
            View applicants
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href={`/jobs/${id}/edit`}>
            <Pencil className="size-4" />
            Edit
          </Link>
        </Button>
        {isLive && (
          <Button type="button" variant="secondary" onClick={() => setDialog('share')}>
            <Share2 className="size-4" />
            Share
          </Button>
        )}
        <Button asChild variant="ghost">
          <Link href={`/post-job?duplicate=${id}`}>
            <Copy className="size-4" />
            Duplicate
          </Link>
        </Button>
        {(isLive || status === 'EXPIRED') && (
          <Button type="button" variant="ghost" onClick={() => setDialog('close')}>
            <X className="size-4" />
            Close
          </Button>
        )}
        {(status === 'CLOSED' || status === 'EXPIRED') && (
          <Button type="button" variant="ghost" onClick={() => setDialog('reopen')}>
            <RotateCcw className="size-4" />
            Reopen
          </Button>
        )}
        <Button asChild variant="ghost">
          <a href={publicUrl} target="_blank" rel="noopener noreferrer">
            {wasPublished ? (
              <ExternalLink className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
            {wasPublished ? 'View public page' : 'Preview'}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </Button>
      </div>

      {/* Dialogs live outside the bar; conditional mount = state resets each open. */}
      {(dialog === 'close' || dialog === 'reopen') && (
        <JobStatusDialog
          id={id}
          title={title}
          action={dialog}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          // Reopen doesn't reset expiresAt — an EXPIRED job needs its date
          // extended or the nightly sweep re-expires it (matches JobRowMenu).
          showExpiryNote={status === 'EXPIRED'}
        />
      )}
      {dialog === 'share' && (
        <ShareJobDialog title={title} url={publicUrl} open onOpenChange={(o) => !o && setDialog(null)} />
      )}
    </>
  );
}
