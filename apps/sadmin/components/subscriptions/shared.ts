// Shared bits of the Subscriptions console's mutation islands. Kept out of the
// component files so the error copy has ONE definition: three dialogs answering
// the same API would otherwise drift into three different sentences for the same
// 409, and the wording is the whole point of these messages.

/**
 * A native form control styled to match the design system's SelectTrigger.
 *
 * Native `<select>` rather than the Radix Select, because every form in this
 * portal (LoginForm, JobDecisionForm) uses native controls and a native listbox
 * stays usable as the company list grows past what a popover can show. The
 * tokens are copied from SelectTrigger so the two are visually identical.
 */
export const FIELD_CLASS =
  'flex h-9 w-full items-center justify-between rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-3 text-sm text-[var(--color-fg)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Turns a failed admin-billing response into a sentence staff can act on.
 *
 * Bespoke copy for the refusals an admin can actually do something about, rather
 * than surfacing the raw API sentence for every status — the same treatment
 * DeleteJobPostingButton gives its three.
 *
 * The 409 is the one worth getting right: it is how the API says "this
 * subscription was paid for through the gateway", which is a permanent property
 * of that row, not a retryable failure. A generic "please try again" would send
 * staff round a loop that can never succeed.
 */
export async function describeApiError(
  res: Response,
  action: 'grant' | 'update',
): Promise<string> {
  if (res.status === 503) return 'Subscription changes are currently switched off.';
  if (res.status === 401) return 'Your session has expired. Sign in again.';
  if (res.status === 404) {
    return action === 'grant'
      ? 'That company or plan no longer exists.'
      : 'This subscription no longer exists.';
  }
  if (res.status === 409) {
    // The API distinguishes several conflicts (already has a live plan, gateway
    // -paid, terminal status, no owner to hold it) and each message is written
    // for staff, so this is the one status where the server's own sentence is
    // better than anything generic.
    const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
    return typeof body?.message === 'string'
      ? body.message
      : 'That change conflicts with the current state of this subscription.';
  }
  const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
  return typeof body?.message === 'string' ? body.message : `Request failed (${res.status}).`;
}
