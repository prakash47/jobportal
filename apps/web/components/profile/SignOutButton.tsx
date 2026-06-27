'use client';

import { useState } from 'react';
import { Button } from '@jobportal/ui';
import { LogOut } from '@jobportal/ui/icons';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Calls the API logout endpoint (clears the auth cookies, revokes the refresh
// token) then hard-navigates home. Cookies live on the shared `localhost` host
// in dev and the parent domain in prod, so the API-cleared cookies are gone for
// the web app too. Redirect runs even if the network call fails so a user is
// never stuck "signed in" on a dead API.
export function SignOutButton() {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch {
      // Ignore — fall through to the redirect regardless.
    }
    window.location.assign('/');
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      loading={busy}
      // The visible label collapses below `sm`; an explicit aria-label keeps a
      // stable accessible name at every breakpoint (the icon stays aria-hidden).
      aria-label="Sign out"
      leadingIcon={<LogOut className="size-4" aria-hidden="true" />}
    >
      <span className="hidden sm:inline">Sign out</span>
    </Button>
  );
}
