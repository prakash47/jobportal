'use client';

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { IconButton, Popover, PopoverContent, PopoverTrigger, cn } from '@jobportal/ui';
import {
  Copy,
  ExternalLink,
  Eye,
  MoreVertical,
  Pencil,
  RotateCcw,
  Share2,
  Trash2,
  X,
} from '@jobportal/ui/icons';
import type { JobStatus } from './JobStatusBadge';
import { DeleteJobDialog } from './DeleteJobDialog';
import { JobStatusDialog } from './JobStatusDialog';
import { ShareJobDialog } from './ShareJobDialog';

// Keyboard focus keeps a real ring (WCAG 2.4.7) — inset so it stays inside the
// popover's p-1 padding; the muted background is a secondary cue only.
const ITEM_CLASS =
  'flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-sm text-[var(--color-fg)] transition-colors hover:bg-[var(--color-bg-muted)] focus:bg-[var(--color-bg-muted)] focus-visible:outline-2 focus-visible:outline-[var(--color-ring)] focus-visible:-outline-offset-2';
const ICON_CLASS = 'size-4 shrink-0 text-[var(--color-fg-muted)]';
// The base danger token is 14px-normal-text AA-insufficient on the elevated
// popover surface (~4.0:1) — darken it locally, same color-mix approach as the
// NotificationBell badge (shared theme.css deliberately untouched).
const DANGER_TEXT = 'text-[color-mix(in_oklch,var(--color-danger),black_18%)]';

type DialogKind = 'close' | 'reopen' | 'delete' | 'share';

type Entry =
  | 'separator'
  | {
      key: string;
      label: string;
      icon: ReactNode;
      /** Exactly one of href/onSelect. External hrefs open in a new tab. */
      href?: string;
      external?: boolean;
      onSelect?: () => void;
      danger?: boolean;
      disabled?: boolean;
      /** Small second line explaining why the item is disabled. */
      disabledHint?: string;
    };

/**
 * The per-row ⋮ action menu on the Jobs list (SRS §4.9): Preview / View
 * public job page, Share, Edit, Duplicate, Close / Reopen, Delete.
 *
 * Built on the portalled Radix Popover (the NotificationBell pattern — no new
 * dependency; the portal also escapes the table's overflow-x-auto clip) with
 * menu semantics hand-rolled: role=menu/menuitem, roving arrow-key focus,
 * Home/End, Tab-out closes. Radix supplies outside-click, Escape, and
 * focus-return-to-trigger.
 *
 * Ownership: the list is company-wide but every mutation is own-jobs-only at
 * the API (getOne 404s), so teammate rows get only the read-only items
 * (Preview / View public page / Share) — no menu entry that can't succeed.
 */
export function JobRowMenu({
  id,
  title,
  status,
  isOwn,
  publicUrl,
  hasApplications,
  deleteEnabled,
}: {
  id: number;
  title: string;
  status: JobStatus;
  isOwn: boolean;
  publicUrl: string;
  hasApplications: boolean;
  /** L2 of killswitch.recruiter_job_delete — server-evaluated per request. */
  deleteEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isLive = status === 'ACTIVE';
  // Published at some point → seekers may hold the URL → "View public job
  // page" (the page shows a closed/expired notice for non-live states).
  // Never published (draft / pending review) → "Preview" of the same page.
  const wasPublished = isLive || status === 'EXPIRED' || status === 'CLOSED';

  function openDialog(kind: DialogKind) {
    setDialog(kind);
    setOpen(false); // Radix returns focus to the trigger; the dialog takes over from there.
  }

  const entries: Entry[] = [
    {
      key: 'view',
      label: wasPublished ? 'View public job page' : 'Preview',
      icon: wasPublished ? <ExternalLink className={ICON_CLASS} aria-hidden /> : <Eye className={ICON_CLASS} aria-hidden />,
      href: publicUrl,
      external: true,
    },
  ];
  if (isLive) {
    entries.push({
      key: 'share',
      label: 'Share on social media',
      icon: <Share2 className={ICON_CLASS} aria-hidden />,
      onSelect: () => openDialog('share'),
    });
  }
  if (isOwn) {
    entries.push(
      'separator',
      {
        key: 'edit',
        label: 'Edit',
        icon: <Pencil className={ICON_CLASS} aria-hidden />,
        href: `/jobs/${id}/edit`,
      },
      {
        key: 'duplicate',
        label: 'Duplicate',
        icon: <Copy className={ICON_CLASS} aria-hidden />,
        href: `/post-job?duplicate=${id}`,
      },
    );
    if (isLive || status === 'EXPIRED') {
      entries.push({
        key: 'close',
        label: 'Close',
        icon: <X className={ICON_CLASS} aria-hidden />,
        onSelect: () => openDialog('close'),
      });
    }
    if (status === 'CLOSED' || status === 'EXPIRED') {
      entries.push({
        key: 'reopen',
        label: 'Reopen',
        icon: <RotateCcw className={ICON_CLASS} aria-hidden />,
        onSelect: () => openDialog('reopen'),
      });
    }
    if (deleteEnabled) {
      entries.push('separator', {
        key: 'delete',
        label: 'Delete',
        icon: <Trash2 className="size-4 shrink-0" aria-hidden />,
        onSelect: () => openDialog('delete'),
        danger: true,
        disabled: hasApplications,
        disabledHint: 'Has applications — close it instead',
      });
    }
  }

  function menuItems(): HTMLElement[] {
    return Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  }

  // Roving focus. Disabled items stay focusable (ARIA APG: discoverable but
  // inert) — activation is guarded instead.
  function moveFocus(where: 1 | -1 | 'first' | 'last') {
    const list = menuItems();
    if (list.length === 0) return;
    if (where === 'first' || where === 'last') {
      list[where === 'first' ? 0 : list.length - 1]?.focus();
      return;
    }
    const idx = list.indexOf(document.activeElement as HTMLElement);
    const next = idx === -1 ? (where === 1 ? 0 : list.length - 1) : (idx + where + list.length) % list.length;
    list[next]?.focus();
  }

  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveFocus(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveFocus(-1);
        break;
      case 'Home':
        e.preventDefault();
        moveFocus('first');
        break;
      case 'End':
        e.preventDefault();
        moveFocus('last');
        break;
      case 'Tab':
        // Menus aren't Tab-navigable — leave the menu instead (focus returns
        // to the trigger via Radix, then Tab proceeds naturally).
        setOpen(false);
        break;
      case ' ':
        // Menu convention: Space activates the focused item. Links have no
        // native Space activation (the page would scroll behind the menu);
        // preventDefault + click() covers links and buttons uniformly.
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.click();
        break;
      default:
        break;
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <IconButton
            size="sm"
            aria-label={`Actions for ${title}`}
            aria-haspopup="menu"
            aria-expanded={open}
            icon={<MoreVertical className="size-4" />}
          />
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-60 p-1"
          // The popup container itself is the menu (overrides Radix Popover's
          // role="dialog", matching the trigger's aria-haspopup="menu").
          role="menu"
          aria-label={`Actions for ${title}`}
          onKeyDown={onMenuKeyDown}
          onOpenAutoFocus={(e) => {
            // Focus the first item, not the container (menu convention).
            e.preventDefault();
            menuItems()[0]?.focus();
          }}
        >
          <div ref={menuRef}>
            {entries.map((entry, i) =>
              entry === 'separator' ? (
                <div
                  key={`sep-${i}`}
                  role="separator"
                  className="mx-2 my-1 h-px bg-[var(--color-border)]"
                />
              ) : entry.href ? (
                entry.external ? (
                  <a
                    key={entry.key}
                    role="menuitem"
                    tabIndex={-1}
                    href={entry.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setOpen(false)}
                    className={ITEM_CLASS}
                  >
                    {entry.icon}
                    {entry.label}
                  </a>
                ) : (
                  <Link
                    key={entry.key}
                    role="menuitem"
                    tabIndex={-1}
                    href={entry.href}
                    onClick={() => setOpen(false)}
                    className={ITEM_CLASS}
                  >
                    {entry.icon}
                    {entry.label}
                  </Link>
                )
              ) : (
                <button
                  key={entry.key}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  aria-disabled={entry.disabled || undefined}
                  onClick={() => {
                    if (entry.disabled) return;
                    entry.onSelect?.();
                  }}
                  className={cn(
                    ITEM_CLASS,
                    entry.danger && !entry.disabled && DANGER_TEXT,
                    // Disabled conveys via muted grey at full opacity — an
                    // opacity dim would drop the hint below legibility.
                    entry.disabled &&
                      'cursor-not-allowed text-[var(--color-fg-muted)] hover:bg-transparent focus:bg-[var(--color-bg-muted)]',
                  )}
                >
                  {entry.icon}
                  <span className="min-w-0">
                    <span className="block">{entry.label}</span>
                    {entry.disabled && entry.disabledHint && (
                      <span className="block text-xs font-normal text-[var(--color-fg-muted)]">
                        {entry.disabledHint}
                      </span>
                    )}
                  </span>
                </button>
              ),
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Dialogs live outside the popover so closing it doesn't unmount them.
          Conditional mount = state resets on every open. */}
      {(dialog === 'close' || dialog === 'reopen') && (
        <JobStatusDialog
          id={id}
          title={title}
          action={dialog}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          // Reopen doesn't reset expiresAt — an EXPIRED job needs its date
          // extended or the nightly sweep re-expires it.
          showExpiryNote={status === 'EXPIRED'}
        />
      )}
      {dialog === 'delete' && (
        <DeleteJobDialog id={id} title={title} open onOpenChange={(o) => !o && setDialog(null)} />
      )}
      {dialog === 'share' && (
        <ShareJobDialog title={title} url={publicUrl} open onOpenChange={(o) => !o && setDialog(null)} />
      )}
    </>
  );
}
