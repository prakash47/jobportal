import type { ReactNode } from 'react';

// Submit-failure message for the auth forms. Same role="alert" live region the
// plain <p> it replaces had — only the presentation changes.
//
// The text is NOT raw --color-danger: that token measures ~4.0:1 on a light
// surface and fails WCAG AA for body text. It is darkened toward the
// foreground with the same theme-aware color-mix recipe the recruiter portal
// already uses for danger copy (jobs/detail/JobValidityCard.tsx), which keeps
// it correct if the surface tokens ever swap.

export function FormError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-[color-mix(in_oklch,var(--color-danger)_45%,var(--color-border))] bg-[color-mix(in_oklch,var(--color-danger)_7%,var(--color-bg-elevated))] px-3 py-2.5 text-sm text-[color-mix(in_oklch,var(--color-danger),var(--color-fg)_30%)]"
    >
      {children}
    </p>
  );
}
