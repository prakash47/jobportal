import './globals.css';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Suspense } from 'react';
import { CanonicalLink } from '../lib/seo';
import { AnalyticsProvider } from '../components/AnalyticsProvider';
import { AppNavigationProgress } from '../components/nav-progress/AppNavigationProgress';
import { readUserFromCookie } from '../lib/auth/server-session';

export const metadata: Metadata = {
  title: 'JobPortal',
  description: 'India-focused job-search and recruitment platform.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Middleware sets x-canonical-pathname / x-canonical-search on the forwarded
  // request after applying SRS §6.3 rules. Reading them here means every page
  // gets a self-referencing canonical for free (SRS §6.3 rule 5).
  const h = await headers();
  const pathname = h.get('x-canonical-pathname') ?? '/';
  const search = h.get('x-canonical-search') ?? undefined;

  // Resolve the authenticated user once at the root so AnalyticsProvider
  // can identify them to PostHog on first render. readUserFromCookie
  // returns null for anon visitors, which keeps the identify call from
  // firing (correct — anons keep their PostHog distinct_id).
  const user = await readUserFromCookie();

  return (
    <html lang="en">
      <head>
        <CanonicalLink path={pathname} search={search ?? undefined} />
      </head>
      <body className="font-sans antialiased">
        <AnalyticsProvider
          user={
            user
              ? { sub: user.sub, email: user.email, role: String(user.role) }
              : null
          }
        />
        {/* Global navigation loader — shows after 250ms of pending client-side
            navigation (tester report: page switches read as dead clicks).
            Suspense: the wrapper reads useSearchParams, which would otherwise
            bail static routes out to CSR. */}
        <Suspense fallback={null}>
          <AppNavigationProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
