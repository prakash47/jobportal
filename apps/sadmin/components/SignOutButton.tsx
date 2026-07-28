'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, LogOut } from '@jobportal/ui/icons';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Sits in the sidebar's account row, on the FIXED navy rail. The shared
// @jobportal/ui Button cannot be used here: its `ghost` variant resolves to
// text-[var(--color-fg)] — near-black — which is invisible on navy, and that
// variant is shared with apps/web and apps/recruiter so it must not be
// re-coloured. Hand-rolled in alpha-white instead, named via aria-label (a
// visible label would not fit the account row). Mirrors apps/recruiter.
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch {
      // Logout failures aren't actionable for the user — continue to /login
      // either way; a stale cookie is rejected by requireSuperAdmin anyway.
    } finally {
      // basePath-relative; Next re-applies '/sadmin'.
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
      /* focus-visible:outline-white — theme.css's base ring is
         --color-primary-500, only 1.96:1 on this navy rail (see SidebarNav). */
      className="shrink-0 rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-white disabled:opacity-50"
    >
      {busy ? (
        <Loader2 className="size-[18px] animate-spin" aria-hidden />
      ) : (
        <LogOut className="size-[18px]" aria-hidden />
      )}
    </button>
  );
}
