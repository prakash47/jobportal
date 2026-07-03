import type { ReactNode } from 'react';
import { SiteHeader } from '../home/SiteHeader';
import { SiteFooter } from '../home/SiteFooter';

// Shared public site chrome: the sticky header + the footer wrapping one <main>
// content slot. Reuses the polished homepage header/footer so the job-search
// pages (and any other public page that opts in) present one consistent,
// professional frame instead of the old bare SRP stub. The header resolves
// signed-in state on the client, so this stays safe inside statically
// revalidated pages (it never reads cookies server-side).
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg)] text-[var(--color-fg)]">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
