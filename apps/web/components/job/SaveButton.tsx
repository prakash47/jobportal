'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@jobportal/ui';
import { Bookmark, BookmarkCheck } from '@jobportal/ui/icons';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface SaveButtonProps {
  jobId: number;
  jobSlug: string;
  isAuthed: boolean;
  initialSaved: boolean;
}

export function SaveButton({ jobId, jobSlug, isAuthed, initialSaved }: SaveButtonProps) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (!isAuthed) {
      const next = `/job/${jobSlug}`;
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
    <Button
      onClick={onClick}
      loading={busy}
      variant="secondary"
      leadingIcon={
        saved ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />
      }
      aria-pressed={saved}
    >
      {saved ? 'Saved' : 'Save'}
    </Button>
  );
}
