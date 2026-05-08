import { AlertCircle } from '@jobportal/ui/icons';

// Calm inline banner shown on the dashboard when the recruiter hasn't
// clicked the verification link yet. No upsell tone (CLAUDE.md §2).
//
// We don't render a 'Resend' button here yet — the resend endpoint lands
// with the admin console (Task 16). Until then, recruiters who lost the
// email can re-register or contact admin.

export function VerifyWorkEmailBanner({ workEmail }: { workEmail: string }) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 text-sm"
    >
      <AlertCircle
        className="mt-0.5 size-4 shrink-0 text-[var(--color-fg-muted)]"
        aria-hidden="true"
      />
      <div className="space-y-0.5">
        <p className="font-medium text-[var(--color-fg)]">Verify your work email</p>
        <p className="text-[var(--color-fg-muted)]">
          We sent a verification link to{' '}
          <span className="font-medium text-[var(--color-fg)]">{workEmail}</span>. Click the link
          before posting your first job.
        </p>
      </div>
    </div>
  );
}
