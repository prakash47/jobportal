import { ChevronRight } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  separator?: ReactNode;
  className?: string;
}

export function Breadcrumbs({ items, separator, className }: BreadcrumbsProps) {
  const sep = separator ?? <ChevronRight className="size-3.5 text-[var(--color-fg-subtle)]" />;
  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center gap-1.5 text-sm', className)}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <Fragment key={`${item.label}-${i}`}>
            {item.href && !isLast ? (
              <a
                href={item.href}
                className="text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
              >
                {item.label}
              </a>
            ) : (
              <span
                aria-current={isLast ? 'page' : undefined}
                className={isLast ? 'font-medium text-[var(--color-fg)]' : 'text-[var(--color-fg-muted)]'}
              >
                {item.label}
              </span>
            )}
            {!isLast && <span aria-hidden="true">{sep}</span>}
          </Fragment>
        );
      })}
    </nav>
  );
}
