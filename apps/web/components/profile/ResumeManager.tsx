'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@jobportal/ui';
import { api, apiMultipart } from '../../lib/profile/api-client';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXT = ['.pdf', '.docx', '.doc'];

interface ActiveResume {
  id: number;
  originalFilename: string;
  sizeBytes: number;
  mimeType: string;
  scanStatus: 'PENDING' | 'CLEAN' | 'INFECTED';
  uploadedAt: string;
}

const formatBytes = (b: number) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

export function ResumeManager({
  active,
  downloadEnabled,
}: {
  active: ActiveResume | null;
  downloadEnabled: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function preCheck(file: File): string | null {
    if (file.size === 0) return 'File is empty.';
    if (file.size > MAX_BYTES) return `File is too large (max ${formatBytes(MAX_BYTES)}).`;
    const lower = file.name.toLowerCase();
    if (!ALLOWED_EXT.some((e) => lower.endsWith(e))) {
      return 'Only PDF or DOCX files are allowed.';
    }
    return null;
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const err = preCheck(file);
    if (err) {
      setError(err);
      return;
    }

    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append('file', file);
    const res = await apiMultipart('/me/resume', fd);
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.refresh();
  }

  function onDownload() {
    // The /profile/resume/download server route handles the three-layer flag
    // check and the redirect to the signed R2 URL.
    setError(null);
    window.location.href = '/profile/resume/download';
  }

  async function onDelete() {
    if (!confirm('Remove your resume? This cannot be undone.')) return;
    setBusy(true);
    setError(null);
    const res = await api('/me/resume', { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {active ? (
        <div className="rounded-md border border-[var(--color-border)] p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--color-fg)]">
                {active.originalFilename}
              </p>
              <p className="text-xs text-[var(--color-fg-muted)]">
                {formatBytes(active.sizeBytes)} · uploaded {new Date(active.uploadedAt).toLocaleDateString()}
              </p>
              {active.scanStatus !== 'CLEAN' && (
                <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">
                  Scan status: {active.scanStatus.toLowerCase()}
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              {downloadEnabled && (
                <Button variant="secondary" size="sm" onClick={onDownload}>
                  Download
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={onDelete} disabled={busy}>
                Remove
              </Button>
            </div>
          </div>
          {!downloadEnabled && (
            <p className="mt-3 text-xs text-[var(--color-fg-subtle)]">
              Download is available on paid plans.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-[var(--color-border)] p-6 text-sm text-[var(--color-fg-muted)]">
          No resume on file yet.
        </div>
      )}

      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
          onChange={onFile}
          className="hidden"
        />
        <Button onClick={() => inputRef.current?.click()} loading={busy}>
          {active ? 'Replace resume' : 'Upload resume'}
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
