import Link from 'next/link';
import { prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { requireRecruiter } from '../../lib/auth/require-recruiter';
import { SidebarNav } from '../../components/SidebarNav';
import { SignOutButton } from '../../components/SignOutButton';
import { Logo } from '../../components/brand/Logo';
import { CompanyLogo } from '../../components/CompanyLogo';
import { KycStatusBadge } from '../../components/kyc/KycStatusBadge';
import {
  NotificationBell,
  type NotificationItem,
} from '../../components/notifications/NotificationBell';

// Linear-app-shell: fixed 240px sidebar + main pane. Sidebar holds the nav
// and a sign-out at the bottom; a sticky top bar in the main pane carries the
// company identity (logo + name + KYC status) on the left and the notification
// bell on the right, so both show on every authed page.

export const dynamic = 'force-dynamic';

// Matches the BFF list page size (RecruiterNotificationsService.PAGE_SIZE) so the
// server-rendered feed and the client's first refresh show the same set.
const BELL_FEED_LIMIT = 20;

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRecruiter();

  // Company identity for the top bar (logo + name + KYC status), shown on every
  // authed page. Reads-direct via Prisma. Null only for a just-registered
  // recruiter whose row isn't ready yet — the cluster is simply omitted then.
  const recruiter = await prisma.recruiter.findUnique({
    where: { userId: user.sub },
    select: {
      company: {
        select: { id: true, name: true, logoUrl: true, kyc: { select: { status: true } } },
      },
    },
  });
  const company = recruiter?.company ?? null;

  // Reads-direct topology: server-render the bell's initial unread count + feed
  // via Prisma (the client island then polls + refreshes through the BFF). When
  // killswitch.recruiter_notifications is ON the bell is hidden entirely (L2).
  const notificationsEnabled = !(await isFlagEnabled('killswitch.recruiter_notifications'));
  let initialUnreadCount = 0;
  let initialItems: NotificationItem[] = [];
  if (notificationsEnabled) {
    const [unread, rows] = await Promise.all([
      prisma.notification.count({ where: { userId: user.sub, readAt: null } }),
      prisma.notification.findMany({
        where: { userId: user.sub },
        orderBy: { createdAt: 'desc' },
        take: BELL_FEED_LIMIT,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          linkUrl: true,
          readAt: true,
          createdAt: true,
        },
      }),
    ]);
    initialUnreadCount = unread;
    initialItems = rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      linkUrl: n.linkUrl,
      read: n.readAt !== null,
      createdAt: n.createdAt.toISOString(),
    }));
  }

  // App-shell scroll model: the viewport is locked (h-screen + overflow-hidden)
  // and each pane scrolls independently. The sidebar stays fixed while the main
  // content pane scrolls on its own.
  return (
    <div className="h-screen overflow-hidden bg-[var(--color-bg)]">
      <div className="grid h-screen grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden h-screen border-r border-[var(--color-border)] md:flex md:flex-col md:justify-between md:overflow-y-auto md:p-4">
          <div className="space-y-6">
            <Link
              href="/dashboard"
              aria-label="Career Queue Recruiter — dashboard"
              className="flex items-center gap-2 px-3"
            >
              <Logo variant="mark" priority className="h-7 w-auto" />
              <span className="text-sm font-medium text-[var(--color-fg-muted)]">Recruiter</span>
            </Link>
            <SidebarNav />
          </div>
          <div className="space-y-2 border-t border-[var(--color-border)] pt-4">
            <p className="truncate px-3 text-xs text-[var(--color-fg-muted)]">{user.email}</p>
            <SignOutButton />
          </div>
        </aside>
        <main className="h-screen min-w-0 overflow-y-auto">
          <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-6">
            {company ? (
              <div className="flex min-w-0 items-center gap-2.5">
                <CompanyLogo
                  companyId={company.id}
                  name={company.name}
                  logoUrl={company.logoUrl}
                  size={28}
                />
                <span className="truncate text-sm font-medium text-[var(--color-fg)]">
                  {company.name}
                </span>
                <KycStatusBadge status={company.kyc?.status ?? 'NOT_SUBMITTED'} />
              </div>
            ) : (
              // Keep the bell pinned right (justify-between) even with no company.
              <span aria-hidden />
            )}
            {notificationsEnabled && (
              <NotificationBell
                initialUnreadCount={initialUnreadCount}
                initialItems={initialItems}
              />
            )}
          </header>
          <div className="mx-auto max-w-3xl px-6 py-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
