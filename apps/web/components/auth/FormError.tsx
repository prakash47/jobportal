import type { ReactNode } from 'react';

// Submit-failure message for the auth surfaces. Ported verbatim from
// apps/recruiter/components/auth/FormError.tsx — copied rather than promoted to
// packages/ui, the same precedent PasswordInput sets for auth-only atoms.
//
// The text is NOT raw --color-danger: that token measures ~4.4:1 on a light
// surface and fails WCAG AA for body text. It is darkened toward the foreground
// with a theme-aware color-mix, which keeps it correct if the surface tokens
// ever swap.
//
// `id` is optional: a form-level error describes the submit and names nothing,
// while a field-level caller passes one so the input that failed can point at it
// via aria-describedby — a chain that is only correct while the message is on
// screen, so it has to be built conditionally at the call site.
export function FormError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p
      id={id}
      role="alert"
      className="rounded-md border border-[color-mix(in_oklch,var(--color-danger)_45%,var(--color-border))] bg-[color-mix(in_oklch,var(--color-danger)_7%,var(--color-bg-elevated))] px-3 py-2.5 text-sm text-[color-mix(in_oklch,var(--color-danger),var(--color-fg)_30%)]"
    >
      {children}
    </p>
  );
}
