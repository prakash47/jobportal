import Link from 'next/link';
import type { ReactNode } from 'react';
import { Container } from '@jobportal/ui';
import { SearchInput } from '../../components/header/SearchInput';

// SRP-only header. Cross-page header is deferred to feature/site-shell.
export default function SeoJobsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-fg)]">
      <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]/95 backdrop-blur">
        <Container className="flex h-14 items-center gap-4">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight text-[var(--color-fg)]"
          >
            JobPortal
          </Link>
          <div className="flex-1 max-w-xl">
            <SearchInput />
          </div>
        </Container>
      </header>
      {children}
    </div>
  );
}
