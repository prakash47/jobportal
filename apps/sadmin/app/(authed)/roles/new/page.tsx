import type { Metadata } from 'next';
import Link from 'next/link';
import { FLAG, isFlagEnabled } from '@jobportal/feature-flags';
import { requireAdminScope } from '../../../../lib/auth/require-super-admin';
import { rolesHref } from '../../../../lib/roles/format';
import { InviteStaffForm } from '../../../../components/roles/InviteStaffForm';

export const metadata: Metadata = {
  title: 'Invite staff — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function NewStaffPage() {
  // Layer 2 scope gate — see lib/roles/scope-map.ts. Every page.tsx under
  // app/(authed)/ carries its own call; inheriting from the layout is neither
  // enough for scope-map.test.ts nor enough for real security, since the layout
  // only proves active staff and not this module.
  await requireAdminScope('system', 'EDIT');

  const killed = await isFlagEnabled(FLAG.KILL_ADMIN_ROLES_WRITE);

  // No `data-wide` here, deliberately: the content well stays at max-w-3xl for a
  // form, matching the broadcast composer. Wide is for tables.
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href={rolesHref()}
          className="text-sm text-[var(--color-primary-700)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        >
          ← Back to Roles &amp; Permissions
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          Invite staff
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          They will receive a single-use link, valid for 3 days, to choose their own password. You
          never see or set it.
        </p>
      </header>

      {killed ? (
        // The only page in this console that IS effectively unusable when the
        // killswitch is on, so it says so instead of rendering a form whose
        // submit can only ever 503. The roster and detail pages still render.
        <p
          role="status"
          className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-muted)] px-4 py-3 text-sm text-[var(--color-fg)]"
        >
          Staff provisioning is currently switched off by a killswitch, so invitations cannot be
          sent. Existing access is unaffected and can still be reviewed.
        </p>
      ) : (
        <InviteStaffForm />
      )}
    </div>
  );
}
