'use client';

import { useState } from 'react';
import { Button, Input, Label, cn } from '@jobportal/ui';
import { AlertCircle } from '@jobportal/ui/icons';
import { apiFetch } from '../../lib/api/fetch';

/**
 * The exact phrase the API requires. Mirrors DELETE_CONFIRMATION in
 * apps/api/src/account/dto.ts — the server rejects anything else, so this
 * string is a contract and not a UI choice.
 */
const CONFIRMATION = 'DELETE';

const WHAT_GOES: readonly string[] = [
  'Your profile, education, experience, skills and languages',
  'Every resume you have uploaded',
  'Your applications, saved jobs and job alerts',
  'Your account and sign-in details',
];

export function DeleteAccountCard({ email }: { email: string }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const armed = typed === CONFIRMATION;

  async function deleteAccount() {
    if (!armed) return;
    setBusy(true);
    setError(null);
    try {
      // Versioned path: the endpoint is /v1/me/account (it was added for the
      // mobile client and nothing on the web called it until now).
      const res = await apiFetch('/v1/me/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: CONFIRMATION }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(
          typeof body.message === 'string' ? body.message : `Could not delete (${res.status})`,
        );
      }
      // The API clears the auth cookies on the way out. A client-side route
      // change would keep the dead React tree — with a session that no longer
      // exists — so this is a full document load to a public page.
      window.location.href = '/?deleted=1';
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Could not delete your account.');
    }
  }

  return (
    <div className="space-y-5 rounded-lg border border-[color-mix(in_oklch,var(--color-danger),var(--color-border)_45%)] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--color-danger),var(--color-bg-elevated)_88%)] text-[var(--color-danger)]"
        >
          <AlertCircle className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[var(--color-fg)]">Delete your account</h2>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            This is permanent. There is no undo, and support cannot restore it.
          </p>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-[var(--color-fg)]">What gets deleted</p>
        <ul className="mt-2 space-y-1">
          {WHAT_GOES.map((item) => (
            <li
              key={item}
              className="flex gap-2 text-sm text-[var(--color-fg-muted)] before:text-[var(--color-fg-subtle)] before:content-['—']"
            >
              {item}
            </li>
          ))}
        </ul>
        {/*
          Stated because it is true and because a candidate will otherwise
          assume deletion recalls their applications. It does not: a resume
          already delivered to a recruiter they chose to apply to is the same
          as having sent it, and the API deliberately retains objects an
          Application still references (ADR 0002 decision 7).
        */}
        <p className="mt-3 text-xs text-[var(--color-fg-subtle)]">
          Recruiters you have already applied to keep the application and the resume you sent
          them. Deleting your account stops any new sharing, but cannot recall what was
          delivered.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="delete-confirm">
          Type <span className="font-mono font-semibold text-[var(--color-fg)]">{CONFIRMATION}</span>{' '}
          to confirm
        </Label>
        <Input
          id="delete-confirm"
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
            setError(null);
          }}
          autoComplete="off"
          spellCheck={false}
          aria-describedby="delete-confirm-hint"
          className={cn('max-w-xs font-mono', armed && 'border-[var(--color-danger)]')}
        />
        <p id="delete-confirm-hint" className="text-xs text-[var(--color-fg-subtle)]">
          Deleting the account for {email}.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/*
          No second confirmation dialog. The typed phrase IS the confirmation
          step, and stacking a modal on top of it trains people to click through
          both. The button stays disabled until the phrase is exact.
        */}
        <Button variant="danger" disabled={!armed} loading={busy} onClick={() => void deleteAccount()}>
          Delete my account permanently
        </Button>
        {error && (
          <span role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
