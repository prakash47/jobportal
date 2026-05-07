import './globals.css';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { CanonicalLink } from '../lib/seo';

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

  return (
    <html lang="en">
      <head>
        <CanonicalLink path={pathname} search={search ?? undefined} />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
