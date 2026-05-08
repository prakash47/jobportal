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
      <body className="bg-[var(--color-bg)] font-sans antialiased text-[var(--color-fg)]">
        {children}
      </body>
    </html>
  );
}
