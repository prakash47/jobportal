import { DashboardPageSkeleton } from '../../../components/dashboard/DashboardSkeleton';

// Route-level fallback for client-side navigation into /dashboard (sidebar
// logo, "Dashboard" nav item, post-sign-in redirect). Without it the router
// holds the previous screen until the server component resolves, which reads as
// a dead click on the portal's heaviest page.
//
// The page's own <Suspense> still handles the KPI half separately, so a cold
// load goes: skeleton → shell + verification card → KPIs.
export default function DashboardLoading() {
  return <DashboardPageSkeleton />;
}
