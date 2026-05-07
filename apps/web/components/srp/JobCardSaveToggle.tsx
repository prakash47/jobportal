'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconButton } from '@jobportal/ui';
import { Bookmark, BookmarkCheck } from '@jobportal/ui/icons';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Compact save toggle for JobCard. Anonymous click bounces to /login?next=
// pointing back to the current page so the user comes back to the same SRP
// position. Authed click is a single POST/DELETE with optimistic UI.

export interface JobCardSaveToggleProps {
  jobId: number;
  jobSlug: string;
  isAuthed: boolean;
  initialSaved: boolean;
  // Path the login bounce should return to (e.g. '/jobs?q=react'). Falls back
  // to the JD page when not provided.
  returnTo?: string;
}

export function JobCardSaveToggle({
  jobId,
  jobSlug,
  isAuthed,
  initialSaved,
  returnTo,
}: JobCardSaveToggleProps) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);

  async function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    // The button sits inside an anchor on JobCard — preventDefault prevents
    // the parent navigation when the user clicks the bookmark.
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthed) {
      const next = returnTo ?? `/job/${jobSlug}`;
      router.push(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    const target = !saved;
    setBusy(true);
    setSaved(target); // optimistic
    try {
      const res = await fetch(`${API_URL}/me/saved-jobs/${jobId}`, {
        method: target ? 'POST' : 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
    } catch {
      setSaved(!target); // revert
    } finally {
      setBusy(false);
    }
  }

  return (
    <IconButton
      onClick={onClick}
      disabled={busy}
      variant="ghost"
      size="sm"
      aria-label={saved ? 'Unsave job' : 'Save job'}
      aria-pressed={saved}
      icon={
        saved ? (
          <BookmarkCheck className="size-4" aria-hidden="true" />
        ) : (
          <Bookmark className="size-4" aria-hidden="true" />
        )
      }
    />
  );
}
