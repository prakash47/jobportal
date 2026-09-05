'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, Button } from '@jobportal/ui';
import { apiErrorMessage } from '../../lib/auth/api-error';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Mirrors the server allowlist in apps/api/src/profile/photo-validators.ts.
// Duplicated deliberately and kept narrow: this only decides what the file
// PICKER offers and what we reject before spending a round trip. The server is
// the authority and re-checks everything — a client allowlist is a convenience,
// never a control.
const ACCEPT = 'image/png,image/jpeg,image/webp';
const MAX_BYTES = 5 * 1024 * 1024;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

export interface ProfilePhotoCardProps {
  name: string;
  /** Already resolved against the current asset bases by the server. */
  initialImageUrl: string | null;
}

/**
 * Seeker profile photo — choose, replace, remove.
 *
 * Recruiters are the audience for this image, which is why the card says so:
 * a seeker deciding whether to upload one is really deciding whether a stranger
 * assessing their application should see their face.
 */
export function ProfilePhotoCard({ name, initialImageUrl }: ProfilePhotoCardProps) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl);
  const [busy, setBusy] = useState<null | 'upload' | 'remove'>(null);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    // Reset immediately so picking the SAME file again still fires onChange —
    // otherwise a failed upload cannot be retried without choosing a different
    // file, which reads as the button being dead.
    e.target.value = '';
    if (!file) return;

    setError(null);
    if (file.size > MAX_BYTES) {
      setError(`Photo is too large (max ${MAX_BYTES / (1024 * 1024)} MB)`);
      return;
    }

    setBusy('upload');
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(`${API_URL}/me/profile/photo`, {
        method: 'POST',
        credentials: 'include',
        // No Content-Type header: the browser must set the multipart boundary
        // itself, and providing one silently breaks the upload.
        body,
      });
      const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error(apiErrorMessage(parsed, 'Could not upload that photo'));
      setImageUrl(typeof parsed.imageUrl === 'string' ? parsed.imageUrl : null);
      // The header avatar is server-rendered, so it only picks up the new photo
      // after the server components re-run.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that photo');
    } finally {
      setBusy(null);
    }
  }

  async function onRemove(): Promise<void> {
    setError(null);
    setBusy('remove');
    try {
      const res = await fetch(`${API_URL}/me/profile/photo`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error(apiErrorMessage(parsed, 'Could not remove that photo'));
      setImageUrl(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that photo');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      aria-labelledby={`${inputId}-heading`}
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6"
    >
      <div className="flex items-center gap-5">
        <Avatar
          size="lg"
          {...(imageUrl ? { src: imageUrl } : {})}
          alt={imageUrl ? `${name}'s profile photo` : ''}
          fallback={initials(name)}
          className="size-20 text-lg"
        />

        <div className="min-w-0 flex-1">
          <h2
            id={`${inputId}-heading`}
            className="text-base font-semibold text-[var(--color-fg)]"
          >
            Profile photo
          </h2>
          <p className="mt-0.5 text-sm text-[var(--color-fg-muted)]">
            Recruiters see this next to your application. PNG, JPG or WebP, up to 5 MB.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={(e) => void onPick(e)}
            />
            {/*
              A label would be the usual trick for styling a file input, but the
              button here needs a loading state and a disabled state, so it
              drives the hidden input directly instead.
            */}
            <Button
              type="button"
              variant="secondary"
              loading={busy === 'upload'}
              disabled={busy !== null}
              onClick={() => inputRef.current?.click()}
            >
              {imageUrl ? 'Change photo' : 'Upload photo'}
            </Button>

            {imageUrl && (
              <Button
                type="button"
                variant="ghost"
                loading={busy === 'remove'}
                disabled={busy !== null}
                onClick={() => void onRemove()}
              >
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 text-sm text-[color-mix(in_oklch,var(--color-danger),var(--color-fg)_30%)]"
        >
          {error}
        </p>
      )}
    </section>
  );
}
