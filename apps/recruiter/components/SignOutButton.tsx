'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@jobportal/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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
    <Button variant="ghost" size="sm" onClick={onClick} loading={busy} className="w-full justify-start">
      Sign out
    </Button>
  );
}
