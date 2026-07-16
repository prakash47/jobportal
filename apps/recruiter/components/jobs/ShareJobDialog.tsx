'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@jobportal/ui';
import { Check, Copy, Linkedin, MessageCircle, Twitter } from '@jobportal/ui/icons';

const ROW_CLASS =
  'flex w-full items-center gap-3 rounded-md border border-[var(--color-border)] px-3 py-2.5 text-sm font-medium text-[var(--color-fg)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]';

/**
 * "Share on social media" for a live job posting (Jobs list 3-dot menu).
 * Web-intent links only — no SDKs, no tracking params (CLAUDE.md §2/§9).
 * Mirrors the seeker site's ShareButtons (X + LinkedIn + copy) and adds
 * WhatsApp, the channel recruiters here actually share jobs on.
 */
export function ShareJobDialog({
  title,
  url,
  open,
  onOpenChange,
}: {
  title: string;
  url: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset the "Copied" affordance whenever the dialog closes, and never leave
  // a timer running past unmount.
  useEffect(() => {
    if (!open) setCopied(false);
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, [open]);

  const encodedUrl = encodeURIComponent(url);
  const shareText = `We're hiring: ${title}`;

  const targets: { key: string; label: string; href: string; icon: ReactNode }[] = [
    {
      key: 'linkedin',
      label: 'Share on LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      icon: <Linkedin className="size-4 shrink-0 text-[var(--color-fg-muted)]" aria-hidden />,
    },
    {
      key: 'x',
      label: 'Share on X',
      href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodeURIComponent(shareText)}`,
      icon: <Twitter className="size-4 shrink-0 text-[var(--color-fg-muted)]" aria-hidden />,
    },
    {
      key: 'whatsapp',
      label: 'Share on WhatsApp',
      href: `https://wa.me/?text=${encodeURIComponent(`${shareText} — ${url}`)}`,
      icon: <MessageCircle className="size-4 shrink-0 text-[var(--color-fg-muted)]" aria-hidden />,
    },
  ];

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable (permissions/insecure context) — the URL
      // below stays selectable by hand, so fail quiet rather than alarm.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share this job</DialogTitle>
          <DialogDescription>
            Send &ldquo;{title}&rdquo; to candidates on social media, or copy the public link.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {targets.map((t) => (
            <a
              key={t.key}
              href={t.href}
              target="_blank"
              rel="noopener noreferrer"
              className={ROW_CLASS}
            >
              {t.icon}
              {t.label}
            </a>
          ))}
          <button type="button" onClick={copyLink} className={ROW_CLASS}>
            {copied ? (
              <Check className="size-4 shrink-0 text-[var(--color-success)]" aria-hidden />
            ) : (
              <Copy className="size-4 shrink-0 text-[var(--color-fg-muted)]" aria-hidden />
            )}
            {copied ? 'Link copied' : 'Copy link'}
          </button>
          {/* role=status → the copy confirmation is announced to screen readers. */}
          <p role="status" className="sr-only">
            {copied ? 'Job link copied to clipboard' : ''}
          </p>
          <p className="break-all rounded-md bg-[var(--color-bg-muted)] px-3 py-2 text-xs text-[var(--color-fg-muted)]">
            {url}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
