'use client';

import { Toaster as SonnerToaster, toast } from 'sonner';

// Wrap sonner so consumers import from @jobportal/ui rather than directly.
// Mount <Toaster /> once at AppShell; call toast(...) from anywhere.

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      duration={4000}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'group rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg)] shadow-md',
          title: 'text-sm font-medium',
          description: 'text-sm text-[var(--color-fg-muted)]',
          actionButton: 'bg-[var(--color-fg)] text-[var(--color-bg)]',
          cancelButton: 'bg-[var(--color-bg-muted)] text-[var(--color-fg)]',
        },
      }}
    />
  );
}

export { toast };
