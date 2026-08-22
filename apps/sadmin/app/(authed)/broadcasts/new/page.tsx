import type { Metadata } from 'next';
import Link from 'next/link';
import { FLAG, isFlagEnabled } from '@jobportal/feature-flags';
import { ArrowLeft } from '@jobportal/ui/icons';
import { broadcastsHref } from '../../../../lib/broadcasts/format';
import { BroadcastComposer } from '../../../../components/broadcasts/BroadcastComposer';
import { requireAdminScope } from '../../../../lib/auth/require-super-admin';

export const metadata: Metadata = {
  title: 'New broadcast — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Compose a new broadcast.
 *
 * ⚠ NOT gated by the killswitch, deliberately. The flag stops DISPATCH, and
 * `notFound()`-ing this route would prevent staff from even drafting the notice
 * they are trying to get ready — which during an incident is the opposite of
 * useful. The composer's own banner says the Send control is currently off, and
 * the API refuses the send regardless. Same Layer-2-without-Layer-1 shape every
 * other admin console in this portal uses.
 */
export default async function NewBroadcastPage() {
  // Layer 2 scope gate for this route segment — see
  // lib/roles/scope-map.ts. The (authed) layout only proves the caller is
  // active staff; this proves they hold THIS module. Load-bearing because
  // the reads below hit Postgres directly and never reach AdminGuard.
  await requireAdminScope('communications', 'READ_ONLY');

  const killed = await isFlagEnabled(FLAG.KILL_ADMIN_BROADCAST_SEND);

  return (
    <div className="space-y-6">
      <Link
        href={broadcastsHref('ALL', 1)}
        className="inline-flex items-center gap-1.5 rounded text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Back to broadcasts
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          New broadcast
        </h1>
        {/* States the whole flow up front. Someone opening this screen for the
            first time needs to know that pressing the button at the bottom does
            not send anything — otherwise the safe thing to do is not press it. */}
        <p className="text-sm text-[var(--color-fg-muted)]">
          Write the message, choose who it goes to, then save it as a draft. You will be able to
          send yourself a test copy before anything reaches anyone else.
        </p>
      </header>

      {killed && (
        <p className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-muted)] px-4 py-3 text-sm text-[var(--color-fg)]">
          Sending is currently switched off by a killswitch. You can still write and test this
          broadcast — the Send control will be disabled until it is switched back on.
        </p>
      )}

      <BroadcastComposer />
    </div>
  );
}
