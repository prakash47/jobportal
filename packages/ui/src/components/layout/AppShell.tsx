import { type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface AppShellProps {
  header?: ReactNode;
  sidebar?: ReactNode;
  children: ReactNode;
  className?: string;
}

// Standard app shell — fixed header, optional sidebar, scrollable main.
// Skip-link is wired so keyboard users can jump past the chrome (SRS §3.1).
export function AppShell({ header, sidebar, children, className }: AppShellProps) {
  return (
    <div className={cn('flex min-h-screen flex-col bg-[var(--color-bg)] text-[var(--color-fg)]', className)}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-[var(--color-bg-elevated)] focus:px-3 focus:py-1.5 focus:text-sm focus:text-[var(--color-fg)] focus:shadow-md"
      >
        Skip to main content
      </a>
      {header && (
        <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]/95 backdrop-blur">
          {header}
        </header>
      )}
      <div className="flex flex-1">
        {sidebar && (
          <aside className="hidden w-60 shrink-0 border-r border-[var(--color-border)] lg:block">
            {sidebar}
          </aside>
        )}
        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
