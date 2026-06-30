'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  IconButton,
  cn,
} from '@jobportal/ui';
import { Bell } from '@jobportal/ui/icons';
import { api } from '../../lib/api-client';

// Mirrors the BFF NotificationView (createdAt serialised to an ISO string for
// the server→client prop boundary).
export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  read: boolean;
  createdAt: string;
}

// Near-real-time via polling (no realtime transport in this stack — the bell
// matches the app's fetch idiom). 35s keeps the unread badge fresh between
// navigations without hammering the BFF.
const POLL_MS = 35_000;

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  return `${weeks}w ago`;
}

export function NotificationBell({
  initialUnreadCount,
  initialItems,
}: {
  initialUnreadCount: number;
  initialItems: NotificationItem[];
}) {
  const router = useRouter();
  const [unread, setUnread] = useState(initialUnreadCount);
  const [items, setItems] = useState<NotificationItem[]>(initialItems);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // Bumped on every optimistic mutation so an in-flight poll that started before
  // the mutation can't clobber the just-applied count when it resolves.
  const mutationStamp = useRef(0);

  // Poll the unread count so the badge stays current while the recruiter works.
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const stampAtStart = mutationStamp.current;
      const res = await api<{ unreadCount: number }>('/recruiter/notifications/unread-count');
      // Drop the result if an optimistic mark-read happened while this request
      // was in flight — its (now-stale) count would otherwise flicker the badge.
      if (!cancelled && res.ok && mutationStamp.current === stampAtStart) {
        setUnread(res.data.unreadCount);
      }
    }
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const refreshList = useCallback(async () => {
    setLoading(true);
    const res = await api<{ items: NotificationItem[]; unreadCount: number }>(
      '/recruiter/notifications',
    );
    setLoading(false);
    if (res.ok) {
      setItems(res.data.items);
      setUnread(res.data.unreadCount);
    }
  }, []);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) void refreshList(); // pull a fresh feed each time it opens
  }

  async function markAllRead() {
    // Optimistic, with rollback on failure so the badge and the per-row read
    // dots can't drift apart (e.g. if the killswitch is flipped ON mid-session
    // and the POST 503s).
    const prevItems = items;
    const prevUnread = unread;
    mutationStamp.current += 1;
    setUnread(0);
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    const res = await api('/recruiter/notifications/read-all', { method: 'POST' });
    if (!res.ok) {
      setItems(prevItems);
      setUnread(prevUnread);
    }
  }

  function handleItemClick(item: NotificationItem) {
    setOpen(false);
    if (item.linkUrl) router.push(item.linkUrl);
    if (item.read) return;
    // Optimistic mark-read with rollback if the PATCH fails. Runs in the
    // background — the bell lives in the (authed) layout, so it stays mounted
    // across the navigation above.
    mutationStamp.current += 1;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, read: true } : i)));
    setUnread((u) => Math.max(0, u - 1));
    void api(`/recruiter/notifications/${item.id}/read`, { method: 'PATCH' }).then((res) => {
      if (!res.ok) {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, read: false } : i)));
        setUnread((u) => u + 1);
      }
    });
  }

  const badgeLabel = unread > 9 ? '9+' : String(unread);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <div className="relative inline-flex">
        <PopoverTrigger asChild>
          <IconButton
            aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
            icon={<Bell className="size-5" />}
          />
        </PopoverTrigger>
        {unread > 0 && (
          <span
            aria-hidden
            className="pointer-events-none absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--color-danger),black_18%)] px-1 text-[10px] font-semibold leading-none text-white"
          >
            {badgeLabel}
          </span>
        )}
      </div>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <p className="text-sm font-semibold text-[var(--color-fg)]">Notifications</p>
          {unread > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs font-medium text-[var(--color-primary-600)] hover:underline"
            >
              Mark all as read
            </button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-[var(--color-fg-muted)]">
              {loading ? 'Loading…' : 'No notifications yet.'}
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-bg-muted)]',
                      !item.read && 'bg-[var(--color-bg-muted)]',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'mt-1.5 size-2 shrink-0 rounded-full',
                        item.read ? 'bg-transparent' : 'bg-[var(--color-primary-600)]',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-[var(--color-fg)]">
                        {item.title}
                      </span>
                      {item.body && (
                        <span className="mt-0.5 block text-xs text-[var(--color-fg-muted)]">
                          {item.body}
                        </span>
                      )}
                      <span className="mt-1 block text-xs text-[var(--color-fg-subtle)]">
                        {timeAgo(item.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
