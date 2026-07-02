import type { ReactNode } from 'react';
import { cn } from '@jobportal/ui';

// The one content surface every dashboard page sits on: an elevated card over
// the muted canvas (borders over shadows, CLAUDE.md §2). Lists pass p-0 +
// divide-y; forms pass the default padding.
export function ContentCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]',
        className,
      )}
    >
      {children}
    </div>
  );
}
