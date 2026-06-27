import type { Metadata } from 'next';
import { requireUser } from '../../lib/auth/require-user';
import { DashboardHeader } from '../../components/profile/DashboardHeader';
import { SiteFooter } from '../../components/home/SiteFooter';

// SRS §4.3 — profile/dashboard pages are private; never indexed.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

// Shared chrome for the seeker dashboard + all account/edit sub-pages. Mirrors
// the onboarding shell (brand header + site footer on a muted canvas). The
// requireUser guard here covers every /profile/* route; the left-rail sub-nav
// for the edit sections lives in AccountShell, not here, so the hub renders
// full-width.
export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg-muted)]">
      <DashboardHeader email={user.email} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      <SiteFooter />
    </div>
  );
}
