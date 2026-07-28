import type { ComponentType, SVGProps } from 'react';
import { cn } from '@jobportal/ui';

export interface KpiCardProps {
  label: string;
  value: number;
  /** One short line of context under the number. Must describe what was counted. */
  hint: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

// One headline platform metric. Mirrors the recruiter dashboard's KpiTile, minus
// the drill-down link: nothing on this portal has a list view to drill into yet,
// and a link to a page that does not exist is worse than no link.
//
// A zero renders muted rather than in full foreground, matching KpiTile — but
// deliberately NOT with --color-fg-subtle, which is a known repo-wide AA
// failure (~2.5:1 on this canvas).
export function KpiCard({ label, value, hint, icon: Icon }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
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
        {/* en-IN grouping (1,00,000 not 100,000) — the app is India-only. */}
        {value.toLocaleString('en-IN')}
      </span>
      <span className="mt-1 block text-xs text-[var(--color-fg-muted)]">{hint}</span>
    </div>
  );
}
