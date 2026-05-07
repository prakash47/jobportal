import { type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--color-border)] p-12 text-center',
        className,
      )}
    >
      {icon && <div className="text-[var(--color-fg-subtle)]">{icon}</div>}
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      {description && <p className="max-w-sm text-sm text-[var(--color-fg-muted)]">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
