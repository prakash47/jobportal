import Link from 'next/link';
import { Suspense } from 'react';
import { prisma } from '@jobportal/db';
import { requireAdminStaff } from '../../lib/auth/require-super-admin';
import { AppNavigationProgress } from '../../components/nav-progress/AppNavigationProgress';
import { SidebarNav } from '../../components/SidebarNav';
import { SignOutButton } from '../../components/SignOutButton';
import { Logo } from '../../components/brand/Logo';

// App shell: fixed 256px brand-navy rail + a sticky white top bar over a muted
// canvas, so cards read as elevated. This is the recruiter portal's shell
// (which in turn mirrors the job-seeker dashboard's DashboardChrome), so all
// three portals read as one product.
//
// The rail's navy does NOT follow the light/dark token swap, so everything on
// it is styled in alpha-white and the Logo is forced to its reverse asset via
// `onDark` — this app mounts no ThemeProvider, so `[data-theme="dark"]` never
// matches and the auto path would put the NAVY logo on the NAVY rail.

export const dynamic = 'force-dynamic';

// Initials for the account-row avatar: first + last word of the display name.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  // The COARSE gate for every page in this group: signed in, ADMIN, and holding
  // an ACTIVE staff row. Layer 2; see require-super-admin.ts for why this is the
  // load-bearing check on a read-only, API-less surface.
  //
  // Per-MODULE scoping happens in each page, not here, because a layout cannot
  // know which route it is wrapping without trusting a header. This call is the
  // floor that catches a page which forgot its own — such a page is reachable by
  // any staff tier, but never by a deactivated account or a non-admin.
  //
  // The nav is NOT filtered by scope yet, deliberately. Doing so means giving
  // SidebarNav props, and it is currently a props-less client component whose
  // NAV_ITEMS array the planned feature/sadmin-admin-migration will APPEND to —
  // a signature change and an append to the same locked file is the worst kind
  // of conflict to hand a teammate. It is also not yet observable: until PR B
  // ships the console, the only way a sub-admin can exist is a direct DB write.
  // PR B takes the SidebarNav lock and filters the rail. Until then an
  // out-of-scope link 404s, which is safe (fail-closed) but not pretty.
  const { user } = await requireAdminStaff();

  // AccessClaims carries email/role but no display name, so one cheap lookup
  // gives the account row something human. Falls back to the email if the row
  // has gone missing (a token outliving its user), which keeps the rail
  // rendering rather than throwing on a nullable read.
  const row = await prisma.user.findUnique({
    where: { id: user.sub },
    select: { name: true },
  });
  const displayName = row?.name?.trim() || user.email;

  // App-shell scroll model: the viewport is locked (h-screen + overflow-hidden)
  // and each pane scrolls independently, so the rail stays put while content
  // scrolls. A page that assumes document-level scroll will be clipped.
  return (
    <div className="h-screen overflow-hidden bg-[var(--color-bg-muted)]">
      {/* Navigation loader: pane-only opaque veil (offset past the rail at md+)
          so the navy rail stays crisp while the content pane loads. Suspense:
          the wrapper reads useSearchParams. */}
      <Suspense fallback={null}>
        <AppNavigationProgress />
      </Suspense>
      <div className="grid h-screen grid-cols-1 md:grid-cols-[256px_minmax(0,1fr)]">
        <aside className="hidden h-screen bg-[var(--color-primary-600)] md:flex md:flex-col">
          <Link
            href="/dashboard"
            aria-label="Career Queue Super Admin — dashboard"
            /* focus-visible:outline-white — the inherited ring (primary-500) is
               only 1.96:1 on this navy rail (see SidebarNav's FOCUS_ON_NAVY). */
            className="flex items-center gap-2.5 px-4 py-4 focus-visible:outline-white"
          >
            <Logo variant="mark" onDark priority className="h-7 w-auto" />
            <span className="text-[15px] font-semibold text-white">Super Admin</span>
          </Link>

          <div className="flex-1 overflow-y-auto px-2 pb-4">
            <SidebarNav />
          </div>

          <div className="mt-auto flex items-center gap-3 border-t border-white/10 px-3 py-3">
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-500)] text-[13px] font-medium text-[var(--color-primary-950)]"
            >
              {initials(displayName)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-white">{displayName}</div>
              {displayName !== user.email && (
                <div className="truncate text-[11px] text-white/50">{user.email}</div>
              )}
            </div>
            <SignOutButton />
          </div>
        </aside>

        <main className="h-screen min-w-0 overflow-y-auto">
          {/* The recruiter's top bar carries the company being acted for. The
              equivalent context here is simply which portal this is — there is
              no notification system for admins, so the right side stays empty
              rather than being filled with something invented. */}
          <header className="sticky top-0 z-10 flex h-14 items-center gap-2.5 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-6">
            <span className="text-sm font-medium text-[var(--color-fg)]">Career Queue</span>
            {/* Not the shared Badge: its `neutral` variant fills with
                --color-bg-muted, which is this shell's canvas colour — fine on
                this white bar, but the hairline-ring treatment is what the
                recruiter portal standardised on for pills that may sit on
                either surface. Kept explicit so moving it cannot make it vanish. */}
            <span className="rounded-full bg-[var(--color-bg-elevated)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-fg-muted)] ring-1 ring-[var(--color-border)] ring-inset">
              Internal
            </span>
          </header>

          <div className="mx-auto max-w-3xl px-6 py-10 has-[[data-wide]]:max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
