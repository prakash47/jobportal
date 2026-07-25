'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, LogOut } from '@jobportal/ui/icons';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Sits in the sidebar's account row, on the FIXED navy rail. The shared
// @jobportal/ui Button can't be used here: its `ghost` variant resolves to
// text-[var(--color-fg)] — near-black — which is invisible on navy, and that
// variant is shared with apps/web so it must not be re-coloured. This is the
// seeker dashboard's own treatment: an icon-only ghost button in alpha-white,
// named via aria-label (the visible label would not fit the account row).
// Behaviour is unchanged — same logout call, same redirect.
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Logout failures aren't actionable for the user — just continue.
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label="Sign out"
      aria-busy={busy || undefined}
      className="shrink-0 rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
    >
      {busy ? (
        <Loader2 className="size-[18px] animate-spin" aria-hidden />
      ) : (
        <LogOut className="size-[18px]" aria-hidden />
      )}
    </button>
  );
}
