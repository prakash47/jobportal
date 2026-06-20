'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label } from '@jobportal/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Google-signup onboarding: email is locked (read-only, from the Google
// account); name is prefilled from Google but editable. Saves via PATCH
// /auth/me, then lands on the seeker dashboard (/profile).
export function OnboardingForm({ initialName, email }: { initialName: string; email: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? 'Could not save your name');
      }
      router.push('/profile');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your name');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="onboarding-email">Email</Label>
        <Input
          id="onboarding-email"
          type="email"
          value={email}
          readOnly
          aria-describedby="onboarding-email-hint"
        />
        <p id="onboarding-email-hint" className="text-xs text-[var(--color-fg-muted)]">
          From your Google account — this can&apos;t be changed.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="onboarding-name">Name</Label>
        <Input
          id="onboarding-name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <Button type="submit" loading={loading} className="w-full">
        Continue
      </Button>
    </form>
  );
}
