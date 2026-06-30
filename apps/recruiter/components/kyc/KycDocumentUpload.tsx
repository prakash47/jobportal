'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@jobportal/ui';
import { api, apiMultipart } from '../../lib/api-client';

const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024; // keep in sync with API MAX_KYC_BYTES

export type KycDocType = 'BUSINESS_REGISTRATION' | 'AUTHORIZED_PERSON_ID';

export interface KycDocumentSlot {
  id: number;
  originalFilename: string;
}

export interface KycDocumentUploadProps {
  docType: KycDocType;
  label: string;
  description: string;
  current: KycDocumentSlot | null;
  // When the submission is locked (PENDING / VERIFIED) the slot is view-only.
  locked: boolean;
}

export function KycDocumentUpload({ docType, label, description, current, locked }: KycDocumentUploadProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick() {
    setError(null);
    inputRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      setError('Please choose a PDF, PNG, JPG, or WebP file.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('File is too large (max 10 MB).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('docType', docType);
      const res = await apiMultipart('/recruiter/kyc/documents', fd);
      if (!res.ok) throw new Error(res.message);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function view() {
    if (!current) return;
    setError(null);
    const res = await api<{ url: string }>(`/recruiter/kyc/documents/${current.id}/download`);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    window.open(res.data.url, '_blank', 'noopener,noreferrer');
  }

  async function remove() {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api(`/recruiter/kyc/documents/${current.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(res.message);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove file');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-[var(--color-border)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--color-fg)]">{label}</p>
          <p className="mt-0.5 text-xs text-[var(--color-fg-subtle)]">{description}</p>
          {current && (
            <p className="mt-2 truncate text-sm text-[var(--color-fg-muted)]" title={current.originalFilename}>
              <span className="text-[var(--color-fg-subtle)]">Uploaded:</span> {current.originalFilename}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {current && (
            <Button variant="ghost" onClick={view} disabled={busy}>
              View
            </Button>
          )}
          {!locked && (
            <Button variant="secondary" onClick={pick} loading={busy} disabled={busy}>
              {current ? 'Replace' : 'Upload'}
            </Button>
          )}
          {current && !locked && (
            <Button variant="ghost" onClick={remove} disabled={busy}>
              Remove
            </Button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={onFile}
      />

      {error && (
        <p role="alert" className="mt-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
