'use client';

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, cn } from '@jobportal/ui';
import { Check, Trash2 } from '@jobportal/ui/icons';
import { api, apiMultipart } from '../../lib/profile/api-client';
import { ConfirmDialog } from '../ui/ConfirmDialog';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXT = ['.pdf', '.docx', '.doc'];

export interface ResumeVersion {
  id: number;
  originalFilename: string;
  sizeBytes: number;
  mimeType: string;
  scanStatus: 'PENDING' | 'CLEAN' | 'INFECTED';
  uploadedAt: string;
  isActive: boolean;
}

const formatBytes = (b: number) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

const isPdf = (v: ResumeVersion) =>
  v.mimeType === 'application/pdf' || v.originalFilename.toLowerCase().endsWith('.pdf');

/**
 * Is this a URL a browser can actually open?
 *
 * With R2 unconfigured, StorageService falls back to `local://memory/<key>` —
 * an opaque internal handle, not a link. Rendering it into an <object> gives a
 * silently blank panel, which reads as "the preview is broken" rather than
 * "object storage is not set up on this machine". A resume is private, so the
 * fix is NOT a public /media passthrough like company logos have: that route is
 * unauthenticated, and pointing it at resumes would publish every candidate's.
 */
const isFetchableUrl = (url: string) => /^https?:\/\//i.test(url);

export function ResumeManager({ versions: initial }: { versions: ResumeVersion[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [versions, setVersions] = useState<ResumeVersion[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [previewOf, setPreviewOf] = useState<ResumeVersion | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<ResumeVersion | null>(null);

  const active = versions.find((v) => v.isActive) ?? null;

  useEffect(() => {
    setVersions(initial);
  }, [initial]);

  // The signed URL is fetched only when a preview is opened, and it expires in
  // 15 minutes. Fetching one per row up front would mint links nobody uses.
  useEffect(() => {
    if (previewOf === null) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await api<{ url: string }>(`/me/resume/${previewOf.id}/download`);
      if (cancelled) return;
      if (!res.ok) {
        setError(res.message);
        setPreviewOf(null);
        return;
      }
      setPreviewUrl(res.data.url);
    })();
    return () => {
      cancelled = true;
    };
  }, [previewOf]);

  function preCheck(file: File): string | null {
    if (file.size === 0) return 'File is empty.';
    if (file.size > MAX_BYTES) return `File is too large (max ${formatBytes(MAX_BYTES)}).`;
    const lower = file.name.toLowerCase();
    if (!ALLOWED_EXT.some((e) => lower.endsWith(e))) {
      return 'Only PDF or DOCX files are allowed.';
    }
    return null;
  }

  async function upload(file: File) {
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
    await refresh();
    router.refresh();
  }

  async function refresh() {
    const res = await api<ResumeVersion[]>('/me/resume/versions');
    if (res.ok) setVersions(res.data);
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void upload(file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void upload(file);
  }

  async function activate(v: ResumeVersion) {
    setBusy(true);
    setError(null);
    const res = await api<ResumeVersion>(`/me/resume/${v.id}/activate`, { method: 'POST' });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    await refresh();
    router.refresh();
  }

  async function download(v: ResumeVersion) {
    setError(null);
    const res = await api<{ url: string }>(`/me/resume/${v.id}/download`);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    if (!isFetchableUrl(res.data.url)) {
      setError('Object storage is not configured on this environment, so the file cannot be downloaded here.');
      return;
    }
    window.location.href = res.data.url;
  }

  async function remove(v: ResumeVersion) {
    setBusy(true);
    setError(null);
    // DELETE /me/resume removes the ACTIVE resume, so a non-active version is
    // promoted first. Without that, removing an old version would silently
    // delete the current one instead.
    if (!v.isActive) await api(`/me/resume/${v.id}/activate`, { method: 'POST' });
    const res = await api('/me/resume', { method: 'DELETE' });
    setBusy(false);
    setPendingRemoval(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    if (previewOf?.id === v.id) setPreviewOf(null);
    await refresh();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Drag-and-drop target. Also the click target, so there is one obvious
          place to put a file rather than a button off to the side. */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'rounded-lg border-2 border-dashed p-6 text-center transition-colors',
          dragging
            ? 'border-[var(--color-primary-600)] bg-[var(--color-primary-50)]'
            : 'border-[var(--color-border-strong)]',
        )}
      >
        <p className="text-sm font-medium text-[var(--color-fg)]">
          {dragging ? 'Drop to upload' : 'Drag a file here, or choose one'}
        </p>
        <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
          PDF or DOCX, up to {formatBytes(MAX_BYTES)}. We keep your last 3 uploads.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
          onChange={onFile}
          className="hidden"
        />
        <Button
          className="mt-3"
          variant="secondary"
          size="sm"
          onClick={() => inputRef.current?.click()}
          loading={busy}
        >
          {active ? 'Upload a new version' : 'Choose a file'}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {versions.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] p-6 text-sm text-[var(--color-fg-muted)]">
          No resume on file yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {versions.map((v) => (
            <li
              key={v.id}
              className={cn(
                'rounded-md border p-4',
                v.isActive
                  ? 'border-[var(--color-primary-600)]'
                  : 'border-[var(--color-border)]',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-[var(--color-fg)]">
                      {v.originalFilename}
                    </p>
                    {v.isActive && <Badge variant="primary">Active</Badge>}
                    {v.scanStatus !== 'CLEAN' && (
                      <Badge variant="warning">Scan {v.scanStatus.toLowerCase()}</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">
                    {formatBytes(v.sizeBytes)} · uploaded{' '}
                    {new Date(v.uploadedAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!v.isActive && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void activate(v)}
                      disabled={busy || v.scanStatus !== 'CLEAN'}
                      leadingIcon={<Check className="size-4" aria-hidden="true" />}
                    >
                      Use this one
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPreviewOf(previewOf?.id === v.id ? null : v)}
                    disabled={v.scanStatus !== 'CLEAN'}
                  >
                    {previewOf?.id === v.id ? 'Hide' : 'View'}
                  </Button>
                  {/* Always available. Downloading a file you uploaded yourself
                      is not a premium feature — see the service comment. */}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void download(v)}
                    disabled={v.scanStatus !== 'CLEAN'}
                  >
                    Download
                  </Button>
                  <button
                    type="button"
                    onClick={() => setPendingRemoval(v)}
                    aria-label={`Remove ${v.originalFilename}`}
                    className="rounded-md p-1.5 text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {previewOf?.id === v.id && (
                <div className="mt-4 border-t border-[var(--color-border)] pt-4">
                  {previewUrl === null ? (
                    <p className="text-sm text-[var(--color-fg-muted)]">Loading preview…</p>
                  ) : !isFetchableUrl(previewUrl) ? (
                    <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)] p-4 text-sm text-[var(--color-fg-muted)]">
                      Object storage isn&rsquo;t configured on this environment, so the file
                      can&rsquo;t be shown. Previews and downloads work wherever R2 is set up.
                    </p>
                  ) : isPdf(v) ? (
                    // <object> rather than <iframe>: it degrades to its own
                    // children when the browser has no PDF viewer, which is
                    // where the download link below comes from.
                    <object
                      data={previewUrl}
                      type="application/pdf"
                      className="h-[70vh] w-full rounded-md border border-[var(--color-border)]"
                      aria-label={`Preview of ${v.originalFilename}`}
                    >
                      <p className="p-4 text-sm text-[var(--color-fg-muted)]">
                        Your browser can&rsquo;t show PDFs inline.{' '}
                        <a
                          href={previewUrl}
                          className="font-medium text-[var(--color-primary-600)] underline underline-offset-2"
                        >
                          Open it in a new tab
                        </a>
                        .
                      </p>
                    </object>
                  ) : (
                    // DOCX has no in-browser renderer we control, and shipping
                    // one would mean a third-party viewer service seeing every
                    // candidate's resume.
                    <p className="text-sm text-[var(--color-fg-muted)]">
                      Word documents can&rsquo;t be previewed in the browser.{' '}
                      <a
                        href={previewUrl}
                        className="font-medium text-[var(--color-primary-600)] underline underline-offset-2"
                      >
                        Download it
                      </a>{' '}
                      to check it, or upload a PDF to preview here.
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null);
        }}
        busy={busy}
        title="Remove this resume?"
        description={
          pendingRemoval
            ? `"${pendingRemoval.originalFilename}" will be removed from your profile. Recruiters you have already applied to keep the copy you sent them.`
            : ''
        }
        confirmLabel="Remove"
        onConfirm={() => {
          if (pendingRemoval) void remove(pendingRemoval);
        }}
      />
    </div>
  );
}
