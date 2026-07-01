import { notFound } from 'next/navigation';
import { prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { requireRecruiter } from '../../../lib/auth/require-recruiter';
import { resolvePermissions } from '../../../lib/users/permissions';
import {
  UsersPanel,
  type PendingInvite,
  type TeamMember,
  type Viewer,
} from '../../../components/users/UsersPanel';

// SRS §4.9 — recruiter Team / User management. Reads the team + pending invites
// direct via Prisma (reads/writes split); mutations go through the BFF. L2 of the
// killswitch lives here (404 when the feature is emergency-stopped); the API is
// the trusted L3 boundary that actually enforces role/permission authority.

export const dynamic = 'force-dynamic';

const ROLE_RANK = { OWNER: 0, ADMIN: 1, MEMBER: 2 } as const;

export default async function UsersPage() {
  if (await isFlagEnabled('killswitch.recruiter_user_management')) notFound();
  const user = await requireRecruiter();

  const caller = await prisma.recruiter.findUnique({
    where: { userId: user.sub },
    select: { id: true, companyId: true, companyRole: true },
  });
  if (!caller) notFound();

  const [memberRows, inviteRows] = await Promise.all([
    prisma.recruiter.findMany({
      where: { companyId: caller.companyId, deactivatedAt: null },
      select: {
        id: true,
        companyRole: true,
        permissions: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.recruiterInvite.findMany({
      where: {
        companyId: caller.companyId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, email: true, companyRole: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const members: TeamMember[] = memberRows
    .map((r) => ({
      recruiterId: r.id,
      name: r.user.name,
      email: r.user.email,
      companyRole: r.companyRole,
      permissions: resolvePermissions(r.companyRole, r.permissions),
      isSelf: r.id === caller.id,
      joinedAt: r.createdAt.toISOString(),
    }))
    .sort(
      (a, b) =>
        ROLE_RANK[a.companyRole] - ROLE_RANK[b.companyRole] || a.name.localeCompare(b.name),
    );

  const pendingInvites: PendingInvite[] = inviteRows.map((i) => ({
    id: i.id,
    email: i.email,
    companyRole: i.companyRole,
    expiresAt: i.expiresAt.toISOString(),
    createdAt: i.createdAt.toISOString(),
  }));

  const viewer: Viewer = { recruiterId: caller.id, companyRole: caller.companyRole };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">Users</h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Manage who can access your company&rsquo;s recruiter account. Invite teammates, set their
          role, and control what each person can do.
        </p>
      </header>

      <UsersPanel members={members} pendingInvites={pendingInvites} viewer={viewer} />
    </div>
  );
}
