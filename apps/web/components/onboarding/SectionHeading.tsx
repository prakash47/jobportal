import { type ReactNode } from 'react';

// Small dotted section heading shared by the onboarding steps (and reused by the
// dashboard's education editor so it matches the onboarding form exactly).
export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="size-1.5 rounded-full bg-[var(--color-accent-500)]" aria-hidden="true" />
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
        {children}
      </h2>
    </div>
  );
}
