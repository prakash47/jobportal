'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { Trash2 } from '@jobportal/ui/icons';
import { apiSend, apiUpload } from './api';

export interface ResumeItem {
  id: number;
  originalFilename: string;
  sizeBytes: number;
  mimeType: string;
  scanStatus: 'PENDING' | 'CLEAN' | 'INFECTED';
  uploadedAt: string;
}

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — mirrors the API limit.

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

// Resume / CV upload for onboarding. Posts the PDF straight to POST /me/resume
// (multipart), which validates + virus-scans it, stores the file (R2 in prod,
// in-memory in dev) and writes a Resume row + sets activeResumeId. Controlled by
// the wizard so the chosen file survives this step's remount on navigation.
export function ResumeUpload({
  resume,
  onChange,
}: {
  resume: ResumeItem | null;
  onChange: (resume: ResumeItem | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so picking the same file again still fires change
    if (!file) return;

    setError(null);
    if (file.size === 0) {
      setError('That file is empty.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`File is too large (max ${formatBytes(MAX_BYTES)}).`);
      return;
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please upload a PDF file.');
      return;
    }

    setBusy(true);
    const fd = new FormData();
    fd.append('file', file);
    const res = await apiUpload<ResumeItem>('/me/resume', fd);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onChange(res.data);
  }

  async function onRemove() {
    setBusy(true);
    setError(null);
    const res = await apiSend('/me/resume', 'DELETE');
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={onFile}
        className="hidden"
      />

      {resume ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] p-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-600)] text-[10px] font-bold tracking-wide text-white">
              PDF
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--color-fg)]">
                {resume.originalFilename}
              </p>
              <p className="text-xs text-[var(--color-fg-muted)]">{formatBytes(resume.sizeBytes)} · uploaded</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="rounded-md px-2 py-1 text-xs font-medium text-[var(--color-primary-600)] transition-colors hover:bg-[var(--color-bg-muted)] disabled:opacity-50"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              aria-label="Remove resume"
              className="rounded-md p-1.5 text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-danger)] disabled:opacity-50"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--color-border-strong)] px-4 py-6 text-center transition-colors hover:border-[var(--color-primary-600)] hover:bg-[var(--color-bg-muted)] disabled:opacity-60"
        >
          <span className="text-sm font-medium text-[var(--color-fg)]">
            {busy ? 'Uploading…' : 'Upload your CV (PDF)'}
          </span>
          <span className="text-xs text-[var(--color-fg-muted)]">PDF up to 5 MB</span>
        </button>
      )}

      {error && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
