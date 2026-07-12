import type { ReactNode } from 'react';
import { SiteHeader } from '../home/SiteHeader';
import { SiteFooter } from '../home/SiteFooter';

// Shared public site chrome: the sticky header + the footer wrapping one <main>
// content slot. Reuses the polished homepage header/footer so the job-search
// pages (and any other public page that opts in) present one consistent,
// professional frame instead of the old bare SRP stub. SiteHeader/SiteFooter
// resolve signed-in state SERVER-SIDE (cookies, via getHeaderUser), so any route
// wrapped in SiteShell renders dynamically — a page here must not rely on static
// ISR/`revalidate` (the personalised header can't be shared-edge-cached).
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg)] text-[var(--color-fg)]">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
