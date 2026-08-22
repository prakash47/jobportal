import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FLAG, isFlagEnabled } from '@jobportal/feature-flags';
import { requireAdminScope } from '../../../../lib/auth/require-super-admin';
import { formatDateIst } from '../../../../lib/jobs/format';
import { formatStaffRole, rolesHref } from '../../../../lib/roles/format';
import { getStaffDetail } from '../../../../lib/roles/queries';
import { StaffAccessForm } from '../../../../components/roles/StaffAccessForm';

export const metadata: Metadata = {
  title: 'Staff access — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface PageProps {
  // Next 16: params is a promise and must be awaited.
  params: Promise<{ id: string }>;
}

export default async function StaffDetailPage({ params }: PageProps) {
  // Layer 2 scope gate — see lib/roles/scope-map.ts.
  const session = await requireAdminScope('system', 'EDIT');

  const { id: raw } = await params;
  // Digits-only before spending a query, the same guard ParseInt32IdPipe applies
  // on the API side. Number() alone accepts '0x1a' and '1e1', and a value past
  // int4 makes Prisma THROW ("out of range for type integer") rather than return
  // no rows — an unhandled 500 anyone can manufacture by adding a digit.
  const id = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) notFound();

  const [staff, killed] = await Promise.all([
    getStaffDetail(id),
    isFlagEnabled(FLAG.KILL_ADMIN_ROLES_WRITE),
  ]);
  // ⚠ No loading.tsx in this segment. One would open a Suspense boundary that
  // flushes the shell before this throws, committing a 200 and degrading the
  // 404 into a soft one — measured on /employers and on broadcasts/[id].
  if (!staff) notFound();

  // The self case. The API refuses any self-directed change with a 409, so the
  // form is rendered read-only rather than left to fail on submit — and the
  // reason is worth stating, because "why can't I edit myself?" otherwise looks
  // like a bug rather than the lockout guard it is.
  const isSelf = staff.userId === session.user.sub;
  const isSuperAdmin = staff.staffRole === 'SUPER_ADMIN';

  return (
    <div data-wide className="space-y-8">
      <header className="space-y-1">
        <Link
          href={rolesHref()}
          className="text-sm text-[var(--color-primary-700)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        >
          ← Back to Roles &amp; Permissions
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          {staff.name}
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)]">{staff.email}</p>
      </header>

      <dl className="grid gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Role" value={formatStaffRole(staff.staffRole)} />
        <Fact label="Status" value={staff.deactivatedAt === null ? 'Active' : 'Deactivated'} />
        <Fact label="Added" value={formatDateIst(staff.createdAt)} />
        {/* An em dash rather than "Unknown": createdById is a loose actor id with
            no FK, so a blank means the provisioner's account is gone — which is
            the intended behaviour, not a broken record. */}
        <Fact label="Added by" value={staff.createdByEmail ?? '—'} />
      </dl>

      {killed && (
        <p className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-muted)] px-4 py-3 text-sm text-[var(--color-fg)]">
          Staff provisioning is currently switched off by a killswitch, so these controls are
          disabled. This account&rsquo;s existing access is unaffected.
        </p>
      )}

      {isSelf ? (
        <p
          role="status"
          className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-muted)] px-4 py-3 text-sm text-[var(--color-fg)]"
        >
          This is your own account. You cannot change your own role, permissions or status — there
          is no second console to recover from, so restoring a super admin who locked themselves
          out means editing the database directly. Ask another super admin to make the change.
        </p>
      ) : (
        <StaffAccessForm
          staffId={staff.id}
          name={staff.name}
          staffRole={staff.staffRole}
          permissions={staff.permissions}
          hasOverrides={staff.hasOverrides}
          deactivated={staff.deactivatedAt !== null}
          isSuperAdmin={isSuperAdmin}
          killed={killed}
        />
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">{label}</dt>
      <dd className="text-sm text-[var(--color-fg)]">{value}</dd>
    </div>
  );
}
