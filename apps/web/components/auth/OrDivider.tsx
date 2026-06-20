// Subtle "or" divider between the Google button and the email/password form.
// Shared by the AuthModal and the standalone /login + /register pages.
export function OrDivider() {
  return (
    <div className="my-4 flex items-center gap-3">
      <span className="h-px flex-1 bg-[var(--color-border)]" />
      <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">or</span>
      <span className="h-px flex-1 bg-[var(--color-border)]" />
    </div>
  );
}
