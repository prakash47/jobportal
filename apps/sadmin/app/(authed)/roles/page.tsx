import type { Metadata } from 'next';
import Link from 'next/link';
import { FLAG, isFlagEnabled } from '@jobportal/feature-flags';
import { requireAdminScope } from '../../../lib/auth/require-super-admin';
import { formatDateIst } from '../../../lib/jobs/format';
import {
  formatExpiry,
  formatModuleReach,
  formatStaffRole,
  formatStaffSummary,
  newStaffHref,
  staffDetailHref,
} from '../../../lib/roles/format';
import { listPendingInvites, listStaff } from '../../../lib/roles/queries';
import type { PendingInviteItem, StaffListItem } from '../../../lib/roles/types';
import { InviteRowActions } from '../../../components/roles/InviteRowActions';

export const metadata: Metadata = {
  title: 'Roles & Permissions — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

// Reads Postgres per request; there is nothing to statically render.
export const dynamic = 'force-dynamic';

// No PageProps: this route takes no search params. The roster is small enough to
// render whole (see lib/roles/queries.ts), so there is no page, tab or q to
// parse — and therefore none of the string | string[] handling those require.

export default async function RolesPage() {
  // Layer 2 scope gate for this route segment — see lib/roles/scope-map.ts. The
  // (authed) layout only proves the caller is active staff; this proves they
  // hold THIS module. Load-bearing rather than cosmetic, because the reads below
  // hit Postgres directly and never reach AdminGuard.
  //
  // system/EDIT makes this SUPER_ADMIN-only and no stored override can widen it
  // (clampSystem pins `system` to the tier default in both directions).
  await requireAdminScope('system', 'EDIT');

  // Layer 2 for the killswitch, and ADVISORY only: the flag gates PROVISIONING,
  // not this console. There is deliberately no Layer 1 middleware gate and no
  // notFound() on the flag — 404ing this route to stop a write would take down
  // the only surface that can see who currently holds what, which is exactly
  // what staff need during whatever incident made someone reach for the switch.
  const [staff, invites, killed] = await Promise.all([
    listStaff(),
    listPendingInvites(),
    isFlagEnabled(FLAG.KILL_ADMIN_ROLES_WRITE),
  ]);

  const active = staff.filter((s) => s.deactivatedAt === null).length;

  return (
    <div data-wide className="space-y-8">
      <div className="space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
              Roles &amp; Permissions
            </h1>
            <p className="text-sm text-[var(--color-fg-muted)]">
              Who holds access to this console, and what each of them can reach. Staff are
              deactivated rather than deleted, so the actions they logged stay attributable.
            </p>
          </div>
          {/* Disabled rather than hidden when killed: the control staying visible
              is what tells an admin the capability exists and is switched off,
              rather than leaving them to wonder where it went. */}
          {killed ? (
            <span
              aria-disabled="true"
              className="cursor-not-allowed rounded-md bg-[var(--color-bg-muted)] px-3 py-2 text-sm font-medium text-[var(--color-fg-muted)]"
            >
              Invite staff
            </span>
          ) : (
            <Link
              href={newStaffHref()}
              className="rounded-md bg-[var(--color-primary-600)] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-700)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2"
            >
              Invite staff
            </Link>
          )}
        </header>

        {killed && (
          <p className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-muted)] px-4 py-3 text-sm text-[var(--color-fg)]">
            Staff provisioning is currently switched off by a killswitch. Access can still be
            reviewed here, but invitations, role changes and deactivations are disabled until it
            is switched back on.{' '}
            <strong className="font-medium">
              Existing access is unaffected — this does not sign anyone out.
            </strong>
          </p>
        )}
      </div>

      <section className="space-y-4" aria-labelledby="sadmin-staff-heading">
        <h2
          id="sadmin-staff-heading"
          className="text-sm font-medium uppercase tracking-wide text-[var(--color-fg-muted)]"
        >
          Staff accounts
        </h2>

        {/* ONE always-mounted live region carrying the count. A role="status"
            that mounts together with its message does not announce — the region
            must always render and only change its TEXT. */}
        <p role="status" className="text-sm text-[var(--color-fg-muted)]">
          {formatStaffSummary(active, staff.length - active)}
        </p>

        {/* The table scrolls inside its own card rather than the document — the
            app shell locks the viewport and scrolls each pane independently. */}
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Name
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Role
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Access
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Added
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {staff.map((s) => (
                <StaffRow key={s.id} staff={s} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <PendingInvites invites={invites} killed={killed} />
    </div>
  );
}

function StaffRow({ staff }: { staff: StaffListItem }) {
  const deactivated = staff.deactivatedAt !== null;
  return (
    <tr className="hover:bg-[var(--color-bg-muted)]">
      <td className="px-4 py-3">
        <span className="block font-medium text-[var(--color-fg)]">{staff.name}</span>
        <span className="mt-0.5 block text-xs text-[var(--color-fg-muted)]">{staff.email}</span>
      </td>
      <td className="px-4 py-3 text-[var(--color-fg-muted)]">{formatStaffRole(staff.staffRole)}</td>
      <td className="px-4 py-3 text-[var(--color-fg-muted)]">
        {formatModuleReach(staff.permissions)}
      </td>
      <td className="px-4 py-3">
        {/* Monochrome plus weight, not hue: --color-success on
            --color-bg-muted measures 2.76:1, below the 4.5:1 AA floor for 12px
            text, which is why the job-postings and broadcast pills took the same
            fix. Deactivated is the notable state here — an active staffer is the
            resting one and needs no emphasis. */}
        <span
          className={`inline-block rounded-md bg-[var(--color-bg-muted)] px-2 py-1 text-xs ${
            deactivated ? 'font-medium text-[var(--color-fg)]' : 'text-[var(--color-fg-muted)]'
          }`}
        >
          {deactivated ? 'Deactivated' : 'Active'}
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-[var(--color-fg-muted)]">
        {formatDateIst(staff.createdAt)}
      </td>
      <td className="px-4 py-3">
        {/* Self-describing out of context: a column of links all named "Manage"
            is what a screen-reader user hears when listing this page's controls.
            The visible word stays FIRST so voice control still matches
            "click Manage" (WCAG 2.5.3 Label in Name). */}
        <Link
          href={staffDetailHref(staff.id)}
          className="rounded font-medium text-[var(--color-primary-700)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        >
          Manage
          <span className="sr-only"> {staff.name}</span>
        </Link>
      </td>
    </tr>
  );
}

/**
 * Invitations that have been sent but not yet accepted.
 *
 * A SEPARATE section below the roster rather than rows inside it, matching the
 * recruiter Users panel: an invitee is not staff yet and has no account, so a
 * row in the staff table would overstate what exists.
 *
 * The resend control is not a convenience. Delivery is unobservable — the
 * transactional queue log-and-drops when Redis is unreachable, and the send is
 * fire-and-forget after the commit — so a pending invite whose mail never
 * arrived looks identical to one the recipient simply has not read.
 */
function PendingInvites({ invites, killed }: { invites: PendingInviteItem[]; killed: boolean }) {
  return (
    <section className="space-y-4" aria-labelledby="sadmin-invites-heading">
      <h2
        id="sadmin-invites-heading"
        className="text-sm font-medium uppercase tracking-wide text-[var(--color-fg-muted)]"
      >
        Pending invitations
      </h2>

      {invites.length === 0 ? (
        <p
          role="status"
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 text-sm text-[var(--color-fg-muted)]"
        >
          No invitations are waiting to be accepted.
        </p>
      ) : (
        <>
          <p role="status" className="text-sm text-[var(--color-fg-muted)]">
            {invites.length} invitation{invites.length === 1 ? '' : 's'} waiting to be accepted
          </p>
          <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Email
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Role
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Invited by
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Expires
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {invites.map((invite) => (
                  <tr key={invite.id} className="hover:bg-[var(--color-bg-muted)]">
                    <td className="px-4 py-3 font-medium text-[var(--color-fg)]">
                      {invite.email}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-fg-muted)]">
                      {formatStaffRole(invite.staffRole)}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-fg-muted)]">
                      {/* An em dash rather than "Unknown": invitedByUserId is a
                          loose actor id with no FK, so a missing inviter means
                          that account is gone, not that the record is broken. */}
                      {invite.invitedByEmail ?? '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[var(--color-fg-muted)]">
                      {formatExpiry(invite.expiresAt)}
                    </td>
                    <td className="px-4 py-3">
                      <InviteRowActions
                        inviteId={invite.id}
                        email={invite.email}
                        killed={killed}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
