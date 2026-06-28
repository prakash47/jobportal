// Server-only entry: DashboardShell pulls in Prisma + the daily-apply quota
// (next/headers). Keep client components (DashboardChrome) out of this barrel so
// it never gets dragged into a client bundle.
export { DashboardShell } from './DashboardShell';
