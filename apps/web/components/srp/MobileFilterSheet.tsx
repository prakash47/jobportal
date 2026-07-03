'use client';

import { useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from '@jobportal/ui';
import { Filter } from '@jobportal/ui/icons';

export function MobileFilterSheet({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-3 text-sm font-medium text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] lg:hidden"
        >
          <Filter className="size-4" aria-hidden="true" />
          Filters
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogTitle className="text-base">Filters</DialogTitle>
        <div className="mt-2">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
