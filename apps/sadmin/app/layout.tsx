import './globals.css';
import type { Metadata } from 'next';

// Internal portal — never indexed. The middleware also sets X-Robots-Tag
// globally; this metadata is the in-page belt-and-braces.
export const metadata: Metadata = {
  title: 'Career Queue — Super Admin',
  description: 'Internal administration portal for Career Queue.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* has-[[data-wide]]:overflow-x-clip — wide data-table pages render a
          [data-wide] root; the table scrolls inside its own card and this stops
          that overflow from ever scrolling the whole document horizontally (an
          inner-scroll app shell must never scroll at the root). Scoped via :has
          so ordinary pages are unaffected. Mirrors apps/recruiter. */}
      <body className="bg-[var(--color-bg)] font-sans antialiased text-[var(--color-fg)] has-[[data-wide]]:overflow-x-clip">
        {children}
      </body>
    </html>
  );
}
