'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@jobportal/ui';
import { api, apiMultipart } from '../../lib/api-client';
import { CompanyLogo } from '../CompanyLogo';

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024; // keep in sync with API MAX_LOGO_BYTES

interface LogoResponse {
  company: { logoUrl: string | null };
}

export interface LogoUploadProps {
  companyId: number;
  companyName: string;
  logoUrl: string | null;
}

// Company logo is shown before the company name across the portal (and, once a
// logo is set, on the public company page). Uploads auto-fire on file select
// (mirrors the candidate ResumeManager) — no separate confirm step.
export function LogoUpload({ companyId, companyName, logoUrl }: LogoUploadProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState<string | null>(logoUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick() {
    setError(null);
    inputRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so picking the same file again re-triggers change.
    e.target.value = '';
    if (!file) return;

    if (!ALLOWED.includes(file.type)) {
      setError('Please choose a PNG, JPG, or WebP image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Logo is too large (max 2 MB).');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiMultipart<LogoResponse>('/recruiter/company/logo', fd);
      if (!res.ok) throw new Error(res.message);
      setCurrent(res.data.company.logoUrl);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<LogoResponse>('/recruiter/company/logo', { method: 'DELETE' });
      if (!res.ok) throw new Error(res.message);
      setCurrent(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove logo');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <CompanyLogo companyId={companyId} name={companyName} logoUrl={current} size={72} />
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={pick} loading={busy} disabled={busy}>
              {current ? 'Replace logo' : 'Upload logo'}
            </Button>
            {current && (
              <Button variant="ghost" onClick={remove} disabled={busy}>
                Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-[var(--color-fg-subtle)]">
            PNG, JPG, or WebP · square works best · max 2&nbsp;MB
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={onFile}
      />

      {error && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
