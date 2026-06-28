import type { Metadata } from 'next';
import { requireUser } from '../../lib/auth/require-user';
import { DashboardShell } from '../../components/dashboard';

// SRS §4.3 — profile/dashboard pages are private; never indexed.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <DashboardShell user={user}>{children}</DashboardShell>;
}
