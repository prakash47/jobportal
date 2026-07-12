import './globals.css';
import type { Metadata } from 'next';

// SRS §4.9.2 — recruiter portal is private; never indexed. The middleware
// also sets X-Robots-Tag globally; metadata is the in-page belt-and-braces.
export const metadata: Metadata = {
  title: 'JobPortal — Recruiter',
  description: 'Recruiter portal for JobPortal.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* has-[[data-wide]]:overflow-x-clip — wide data-table pages (the Jobs list)
          render a [data-wide] root; the table scrolls inside its own card, and
          this stops that overflow from ever scrolling the whole document
          horizontally (an inner-scroll app shell must never scroll at the root).
          Scoped via :has so ordinary max-w-3xl pages are unaffected. */}
      <body className="bg-[var(--color-bg)] font-sans antialiased text-[var(--color-fg)] has-[[data-wide]]:overflow-x-clip">
        {children}
      </body>
    </html>
  );
}
