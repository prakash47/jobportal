import Link from 'next/link';
import { prisma } from '@jobportal/db';
import { FLAG, isFlagEnabled } from '@jobportal/feature-flags';
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

  // These four reads are mutually independent, so they run together rather than
  // in series. The shell blocks every authed page's first paint — including the
  // dashboard, the landing page after sign-in — so the cost here is paid on the
  // slowest of the four, not their sum.
  //
  //  • Company identity for the top bar (logo + name + KYC status), shown on
  //    every authed page. Reads-direct via Prisma. Null only for a
  //    just-registered recruiter whose row isn't ready yet — the cluster is
  //    simply omitted then.
  //  • Plans & Billing nav group, gated on RECRUITER_PLANS_VISIBLE (seeded ON)
  //    so every recruiter — including Free-plan ones, i.e. all of them on day
  //    one — sees the group. Cosmetic only; the middleware (L1) and pages (L2)
  //    enforce visibility for real, and the API (L3) enforces purchasability
  //    separately via SUBSCRIPTION_SYSTEM.
  //  • The notification bell's killswitch (L2 — ON hides the bell entirely).
  //  • The KYC killswitch. /kyc already 404s when it is ON, but this badge kept
  //    rendering regardless, so a recruiter saw a "Not started" / "Action
  //    needed" verification status pointing at a feature that had been switched
  //    off, with no page to go and resolve it.
  const [recruiter, billingEnabled, notificationsKilled, kycKilled] = await Promise.all([
    prisma.recruiter.findUnique({
      where: { userId: user.sub },
      select: {
        company: {
          select: { id: true, name: true, logoUrl: true, kyc: { select: { status: true } } },
        },
      },
    }),
    isFlagEnabled(FLAG.RECRUITER_PLANS_VISIBLE),
    isFlagEnabled('killswitch.recruiter_notifications'),
    isFlagEnabled('killswitch.recruiter_kyc'),
  ]);
  const company = recruiter?.company ?? null;
  const notificationsEnabled = !notificationsKilled;
  const kycEnabled = !kycKilled;

  // Reads-direct topology: server-render the bell's initial unread count + feed
  // via Prisma (the client island then polls + refreshes through the BFF).
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
            <SidebarNav showBilling={billingEnabled} />
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
                {kycEnabled && <KycStatusBadge status={company.kyc?.status ?? 'NOT_SUBMITTED'} />}
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
          {/* Content is capped at a comfortable reading width for forms/detail
              pages. Data-table pages (e.g. the Jobs list) opt into the wider
              content column by rendering a [data-wide] root, so a many-column
              table fits without forcing the page to scroll horizontally. */}
          <div className="mx-auto max-w-3xl px-6 py-10 has-[[data-wide]]:max-w-6xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
