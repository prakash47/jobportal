import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';
import { cn } from '@jobportal/ui';

export interface KpiTileProps {
  label: string;
  value: number;
  /** One short line of context under the number. */
  hint?: string | undefined;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Where the number drills down to. Omitted (or a zero value) renders inert. */
  href?: string | undefined;
  /** Names the destination, e.g. "View open jobs". Only used when linked. */
  ariaAction?: string | undefined;
}

// One headline metric. Follows the rules the Job Detail stats panel established:
// a zero is never a link (no dead click into an empty list) and a zero is muted
// while a real number takes full foreground — the WCAG-AA reason the Jobs table
// documents for not using fg-subtle on values.
export function KpiTile({ label, value, hint, icon: Icon, href, ariaAction }: KpiTileProps) {
  const interactive = href !== undefined && value > 0;

  // The accessible name OPENS with the visible label, so the rendered text is a
  // prefix of the name (WCAG 2.5.3 Label in Name — speech-input users can say
  // what they read). It also keeps the hint, which an aria-label built only
  // from the number would silently drop from the a11y tree.
  const accessibleName = [`${label}: ${value.toLocaleString('en-IN')}`, hint, ariaAction]
    .filter(Boolean)
    .join('. ');

  const body = (
    <>
      <span className="flex items-center gap-1.5 text-sm text-[var(--color-fg-muted)]">
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        {label}
      </span>
      <span
        className={cn(
          'mt-2 block text-2xl font-semibold tabular-nums',
          value === 0 ? 'text-[var(--color-fg-muted)]' : 'text-[var(--color-fg)]',
        )}
      >
        {value.toLocaleString('en-IN')}
      </span>
      {hint && <span className="mt-1 block text-xs text-[var(--color-fg-muted)]">{hint}</span>}
    </>
  );

  const base =
    'block rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4';

  return interactive ? (
    <Link
      href={href}
      aria-label={accessibleName}
      className={cn(
        base,
        'transition-colors hover:border-[var(--color-border-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]',
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  );
}
