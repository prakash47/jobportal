import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { prisma, Prisma } from '@jobportal/db';
import type { AdminStaffRole, User } from '@jobportal/db';
import { hashPassword, isStrongPassword } from '@jobportal/auth';
import {
  resolveAdminPermissions,
  type AdminPermissionMap,
} from '@jobportal/domain/admin-permissions';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../email/email.service';
import { buildDiff, isDiffEmpty } from '../profile/audit';
import type { AcceptStaffInviteInput, InviteStaffInput, UpdateStaffInput } from './dto';

// L3 killswitch — emergency stop for staff PROVISIONING. ON (enabled:true) means
// DISABLED, the opposite polarity from a feature toggle like
// moderation.jobs.enabled. Asserted before every mutation, including the two
// public token endpoints: accepting an invite creates an admin account, which is
// the most consequential write in this module.
//
// Inlined as a string literal rather than imported from @jobportal/feature-flags'
// keys.ts, matching recruiter-users.service.ts and every other killswitch call
// site in this app. The constant exists there for the admin flags console.
const ROLES_WRITE_KILLSWITCH_FLAG = 'killswitch.admin_roles_write';

// The global outbound-mail stop. Checked before minting an invite so a killed
// mailer surfaces as a 503 the console can show, rather than as an invite row
// that exists with a link nobody will ever receive.
const EMAILS_KILLSWITCH_FLAG = 'killswitch.transactional_emails';

// 72 hours, matching RecruiterInvite: long enough for a colleague to notice the
// email, short enough that a leaked-and-forgotten link stops working.
const INVITE_TTL_HOURS = 72;

function tokenHash(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export interface PendingStaffInviteSummary {
  id: number;
  email: string;
  staffRole: AdminStaffRole;
  expiresAt: Date;
  createdAt: Date;
}

// invite() has three outcomes, because "this email already has an account" is
// the normal case here rather than the exception — CLAUDE.md §9 makes admins by
// direct DB write, so an ADMIN with no staff row is exactly what a hand-promoted
// colleague looks like.
export type InviteStaffResult =
  | { status: 'invited'; invite: PendingStaffInviteSummary }
  // An existing ADMIN account that had no tier: granted in place, no email.
  | { status: 'granted'; staffId: number; email: string }
  // A previously-deactivated staffer: restored in place, no email.
  | { status: 'reactivated'; staffId: number; email: string };

export interface StaffMutationResult {
  id: number;
  staffRole: AdminStaffRole;
  permissions: AdminPermissionMap;
}

export type StaffInvitePreview =
  | { valid: false }
  | { valid: true; email: string; staffRole: AdminStaffRole };

export interface AcceptStaffInviteResult {
  user: User;
  staffId: number;
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AdminStaffService {
  private readonly logger = new Logger(AdminStaffService.name);

  constructor(
    private readonly auth: AuthService,
    private readonly email: EmailService,
  ) {}

  // --- Mutations (AdminGuard has already enforced system/EDIT) --------------
  //
  // No isSuperAdmin() re-check in these methods. The controller declares
  // @RequireAdminScope('system', 'EDIT'), and `system` is the one module
  // clampSystem() will not let a stored blob move — so reaching any of these is
  // already proof of the top tier. A second check here would be a second
  // definition of "super admin" to keep in step with the guard's.

  async invite(actorUserId: number, input: InviteStaffInput): Promise<InviteStaffResult> {
    await this.assertRolesWriteEnabled();

    const email = input.email; // already lowercased by the DTO

    // Consult the User table before minting anything. acceptInvite() can only
    // ever CREATE an account — it cannot link an existing one — so without this
    // we would email a link that could only ever 409.
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        role: true,
        adminStaff: { select: { id: true, deactivatedAt: true } },
      },
    });

    if (existingUser) {
      return this.inviteExistingUser(actorUserId, email, input, existingUser);
    }

    // Brand-new address: this is the only branch that sends mail, so it is the
    // only one the mail killswitch can block.
    await this.assertEmailsEnabled();

    const raw = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3_600_000);
    // Persist an explicit map only when overrides were given; null means "derive
    // from the tier defaults at read time", which keeps those defaults live.
    const permissions = input.permissions
      ? resolveAdminPermissions(input.staffRole, input.permissions)
      : null;

    const invite = await prisma.$transaction(async (tx) => {
      // Supersede any prior still-pending invite for this address. This is the
      // "one active invite per email" constraint: it is partial (WHERE accepted
      // AND revoked IS NULL), which Prisma cannot express as an @@unique, so it
      // lives here inside the create transaction.
      await tx.adminStaffInvite.updateMany({
        where: { email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const created = await tx.adminStaffInvite.create({
        data: {
          email,
          staffRole: input.staffRole,
          // Omit the key entirely when there are no overrides. Passing an
          // explicit `undefined` violates exactOptionalPropertyTypes.
          ...(permissions !== null
            ? { permissions: permissions as unknown as Prisma.InputJsonValue }
            : {}),
          tokenHash: tokenHash(raw),
          invitedByUserId: actorUserId,
          expiresAt,
        },
        select: { id: true, email: true, staffRole: true, expiresAt: true, createdAt: true },
      });
      await tx.profileAuditLog.create({
        data: {
          userId: actorUserId,
          action: 'ADMIN_STAFF_INVITED',
          // The raw token is NEVER written here. The audit log is a record of
          // what was done, not a store of live capabilities.
          diff: { email, staffRole: input.staffRole } as unknown as Prisma.InputJsonValue,
        },
      });
      return created;
    });

    this.sendInviteEmail(email, raw);
    return { status: 'invited', invite };
  }

  /**
   * Re-send an invitation.
   *
   * Necessarily mints a NEW token and supersedes the old row: the database
   * stores only sha256(raw), so the original link is not recoverable by anyone,
   * including us. That is also why this writes its own audit action rather than
   * reusing ADMIN_STAFF_INVITED — a resend is a fresh capability grant, and the
   * previous link stops working the moment it happens.
   *
   * The console needs this because delivery is not observable: the transactional
   * queue log-and-drops when Redis is down, and the send is fire-and-forget after
   * the commit, so a pending invite whose mail never arrived is indistinguishable
   * from one the recipient has not read yet.
   */
  async resendInvite(actorUserId: number, inviteId: number): Promise<PendingStaffInviteSummary> {
    await this.assertRolesWriteEnabled();
    await this.assertEmailsEnabled();

    const existing = await prisma.adminStaffInvite.findUnique({
      where: { id: inviteId },
      select: {
        id: true,
        email: true,
        staffRole: true,
        permissions: true,
        acceptedAt: true,
        revokedAt: true,
      },
    });
    if (!existing) throw new NotFoundException('Invitation not found');
    if (existing.acceptedAt) throw new ConflictException('That invitation was already accepted');
    if (existing.revokedAt) throw new ConflictException('That invitation was revoked');

    const raw = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3_600_000);

    const created = await prisma.$transaction(async (tx) => {
      // Re-read inside the transaction. Without it, a resend racing an accept
      // could revoke the row a moment after someone successfully used it.
      const fresh = await tx.adminStaffInvite.findUnique({
        where: { id: existing.id },
        select: { acceptedAt: true, revokedAt: true },
      });
      if (!fresh || fresh.acceptedAt || fresh.revokedAt) {
        throw new ConflictException('That invitation is no longer pending');
      }
      await tx.adminStaffInvite.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });
      const row = await tx.adminStaffInvite.create({
        data: {
          email: existing.email,
          staffRole: existing.staffRole,
          ...(existing.permissions !== null
            ? { permissions: existing.permissions as unknown as Prisma.InputJsonValue }
            : {}),
          tokenHash: tokenHash(raw),
          invitedByUserId: actorUserId,
          expiresAt,
        },
        select: { id: true, email: true, staffRole: true, expiresAt: true, createdAt: true },
      });
      await tx.profileAuditLog.create({
        data: {
          userId: actorUserId,
          action: 'ADMIN_STAFF_INVITE_RESENT',
          diff: {
            email: existing.email,
            staffRole: existing.staffRole,
            supersededInviteId: existing.id,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      return row;
    });

    this.sendInviteEmail(existing.email, raw);
    return created;
  }

  async revokeInvite(actorUserId: number, inviteId: number): Promise<void> {
    await this.assertRolesWriteEnabled();

    const invite = await prisma.adminStaffInvite.findUnique({
      where: { id: inviteId },
      select: { id: true, email: true, staffRole: true, acceptedAt: true, revokedAt: true },
    });
    if (!invite) throw new NotFoundException('Invitation not found');
    if (invite.acceptedAt) throw new ConflictException('That invitation was already accepted');
    if (invite.revokedAt) return; // idempotent

    await prisma.$transaction(async (tx) => {
      await tx.adminStaffInvite.update({
        where: { id: invite.id },
        data: { revokedAt: new Date() },
      });
      await tx.profileAuditLog.create({
        data: {
          userId: actorUserId,
          action: 'ADMIN_STAFF_INVITE_REVOKED',
          diff: {
            email: invite.email,
            staffRole: invite.staffRole,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    });
  }

  async updateStaff(
    actorUserId: number,
    staffId: number,
    input: UpdateStaffInput,
  ): Promise<StaffMutationResult> {
    await this.assertRolesWriteEnabled();

    const target = await prisma.adminStaff.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        userId: true,
        staffRole: true,
        permissions: true,
        deactivatedAt: true,
        user: { select: { email: true } },
      },
    });
    if (!target || target.deactivatedAt) throw new NotFoundException('Staff member not found');
    this.assertNotSelf(actorUserId, target.userId);

    const roleChanged = input.staffRole !== undefined && input.staffRole !== target.staffRole;
    const newRole: AdminStaffRole = input.staffRole ?? target.staffRole;
    // The only way to leave SUPER_ADMIN through this API: the DTO's role enum is
    // the assignable set, which excludes it, so any staffRole sent for a super
    // admin is a demotion.
    const demotingSuperAdmin = roleChanged && target.staffRole === 'SUPER_ADMIN';

    // Effective before/after maps, for the audit diff and the response.
    const beforePerms = resolveAdminPermissions(target.staffRole, target.permissions);
    let afterPerms: AdminPermissionMap;
    let permissionsData: Prisma.InputJsonValue | typeof Prisma.DbNull | undefined;
    if (input.permissions) {
      afterPerms = resolveAdminPermissions(newRole, input.permissions);
      permissionsData = afterPerms as unknown as Prisma.InputJsonValue;
    } else if (roleChanged) {
      // Role changed with no explicit overrides → clear the blob so the NEW
      // tier's defaults apply and stay live. Prisma.DbNull, not null: `null` on a
      // Json column means "leave alone" to Prisma.
      afterPerms = resolveAdminPermissions(newRole, null);
      permissionsData = Prisma.DbNull;
    } else {
      afterPerms = resolveAdminPermissions(newRole, target.permissions);
      permissionsData = undefined;
    }

    const data: Prisma.AdminStaffUpdateInput = {};
    if (input.staffRole !== undefined) data.staffRole = input.staffRole;
    if (permissionsData !== undefined) data.permissions = permissionsData;

    const diff = buildDiff(
      { staffRole: target.staffRole, ...beforePerms },
      { staffRole: newRole, ...afterPerms },
    );
    const action = roleChanged ? 'ADMIN_STAFF_ROLE_CHANGED' : 'ADMIN_STAFF_PERMISSIONS_CHANGED';

    await prisma.$transaction(async (tx) => {
      if (demotingSuperAdmin) {
        await this.assertNotLastSuperAdmin(tx, target.id);
      }
      await tx.adminStaff.update({ where: { id: target.id }, data });
      if (!isDiffEmpty(diff)) {
        await tx.profileAuditLog.create({
          data: {
            userId: actorUserId,
            action,
            // `changes` carries only the modules that actually moved — never the
            // full resolved map, which would make every row a snapshot of
            // someone's complete access.
            diff: {
              targetStaffId: target.id,
              targetEmail: target.user.email,
              changes: diff,
            } as unknown as Prisma.InputJsonValue,
          },
        });
      }
    });

    return { id: target.id, staffRole: newRole, permissions: afterPerms };
  }

  /**
   * Deactivate a staff member. This is the product's ONLY revocation channel.
   *
   * Soft, never a delete: ProfileAuditLog.user is onDelete: Cascade, so removing
   * the row would silently destroy every KYC approval, OTP reveal, ledger export
   * and takedown that person ever logged — the records that matter most, lost
   * quietly.
   *
   * Sessions are revoked in the SAME transaction. apps/sadmin never calls
   * /auth/refresh, so there is no token rotation to rely on; killing the sessions
   * plus the per-request staff-row read is what actually ends access.
   */
  async deactivateStaff(actorUserId: number, staffId: number): Promise<void> {
    await this.assertRolesWriteEnabled();

    const target = await prisma.adminStaff.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        userId: true,
        staffRole: true,
        deactivatedAt: true,
        user: { select: { email: true } },
      },
    });
    if (!target) throw new NotFoundException('Staff member not found');
    this.assertNotSelf(actorUserId, target.userId);
    if (target.deactivatedAt) return; // idempotent

    await prisma.$transaction(async (tx) => {
      if (target.staffRole === 'SUPER_ADMIN') {
        await this.assertNotLastSuperAdmin(tx, target.id);
      }
      await tx.adminStaff.update({
        where: { id: target.id },
        data: { deactivatedAt: new Date() },
      });
      await tx.session.updateMany({
        where: { userId: target.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.profileAuditLog.create({
        data: {
          userId: actorUserId,
          action: 'ADMIN_STAFF_DEACTIVATED',
          diff: {
            targetStaffId: target.id,
            targetEmail: target.user.email,
            staffRole: target.staffRole,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    });
  }

  async reactivateStaff(actorUserId: number, staffId: number): Promise<StaffMutationResult> {
    await this.assertRolesWriteEnabled();

    const target = await prisma.adminStaff.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        userId: true,
        staffRole: true,
        permissions: true,
        deactivatedAt: true,
        user: { select: { email: true } },
      },
    });
    if (!target) throw new NotFoundException('Staff member not found');
    if (!target.deactivatedAt) {
      return {
        id: target.id,
        staffRole: target.staffRole,
        permissions: resolveAdminPermissions(target.staffRole, target.permissions),
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.adminStaff.update({
        where: { id: target.id },
        data: { deactivatedAt: null },
      });
      // Re-assert ADMIN on the User row. The AdminStaff row is proof of prior
      // staff standing, and without this a restored staffer whose User.role had
      // drifted would pass the staff check and still be bounced by the role
      // check that runs before it.
      await tx.user.update({ where: { id: target.userId }, data: { role: 'ADMIN' } });
      await tx.profileAuditLog.create({
        data: {
          userId: actorUserId,
          action: 'ADMIN_STAFF_REACTIVATED',
          diff: {
            targetStaffId: target.id,
            targetEmail: target.user.email,
            staffRole: target.staffRole,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    });

    return {
      id: target.id,
      staffRole: target.staffRole,
      permissions: resolveAdminPermissions(target.staffRole, target.permissions),
    };
  }

  // --- Public invite endpoints (the token IS the capability) ----------------

  /**
   * Read-only preview so the public accept page can say "you have been invited
   * as a Support Admin" before the invitee commits to setting a password.
   *
   * Returns a `{ valid: false }` union rather than a 404, and never distinguishes
   * revoked from expired from already-accepted from never-existed. All four are
   * the same answer to someone holding a token: this link does not work. Telling
   * them which would turn the endpoint into an oracle for guessed tokens.
   */
  async previewInvite(token: string): Promise<StaffInvitePreview> {
    await this.assertRolesWriteEnabled();
    const row = await prisma.adminStaffInvite.findUnique({
      where: { tokenHash: tokenHash(token) },
      select: {
        email: true,
        staffRole: true,
        acceptedAt: true,
        revokedAt: true,
        expiresAt: true,
      },
    });
    if (!row || row.revokedAt || row.acceptedAt || row.expiresAt < new Date()) {
      return { valid: false };
    }
    return { valid: true, email: row.email, staffRole: row.staffRole };
  }

  /**
   * Accept an invitation: create the staffer's User + AdminStaff row, consume the
   * invite, and sign them in.
   *
   * POST, never GET — an email scanner or link prefetcher following the URL would
   * otherwise silently consume the invite before the human ever clicked it.
   */
  async acceptInvite(
    input: AcceptStaffInviteInput,
    deviceInfo: string | undefined,
    ipAddress: string | undefined,
  ): Promise<AcceptStaffInviteResult> {
    await this.assertRolesWriteEnabled();
    if (!isStrongPassword(input.password)) throw new BadRequestException('Password too weak');

    const row = await prisma.adminStaffInvite.findUnique({
      where: { tokenHash: tokenHash(input.token) },
      select: {
        id: true,
        email: true,
        staffRole: true,
        permissions: true,
        invitedByUserId: true,
        acceptedAt: true,
        revokedAt: true,
        expiresAt: true,
      },
    });
    if (!row || row.revokedAt || row.acceptedAt || row.expiresAt < new Date()) {
      throw new BadRequestException('This invitation is invalid or has expired');
    }

    const existing = await prisma.user.findUnique({
      where: { email: row.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'An account with this email already exists. Please sign in instead.',
      );
    }

    // argon2 OUTSIDE the transaction. It is memory-hard and deliberately slow;
    // running it inside would hold a Postgres transaction open for its duration.
    const passwordHash = await hashPassword(input.password);

    const created = await prisma.$transaction(async (tx) => {
      // Re-read inside the transaction. This is what closes the double-accept
      // race — the pre-check above cannot, because two requests can both pass it
      // before either commits. Do not remove it on the grounds that the earlier
      // check already ran.
      const fresh = await tx.adminStaffInvite.findUnique({
        where: { id: row.id },
        select: { acceptedAt: true, revokedAt: true, expiresAt: true },
      });
      if (!fresh || fresh.revokedAt || fresh.acceptedAt || fresh.expiresAt < new Date()) {
        throw new BadRequestException('This invitation is invalid or has expired');
      }
      const user = await tx.user.create({
        data: {
          email: row.email,
          passwordHash,
          name: input.name,
          // Plain ADMIN, like every staff tier. AdminStaff is a SIDECAR: eight
          // sites in this repo compare User.role to the literal 'ADMIN', and the
          // tier lives in the row below, never in this column.
          role: 'ADMIN',
          // Following the emailed link proves control of the mailbox.
          emailVerified: true,
        },
      });
      const staff = await tx.adminStaff.create({
        data: {
          userId: user.id,
          staffRole: row.staffRole,
          ...(row.permissions !== null
            ? { permissions: row.permissions as unknown as Prisma.InputJsonValue }
            : {}),
          ...(row.invitedByUserId !== null ? { createdById: row.invitedByUserId } : {}),
        },
        select: { id: true },
      });
      await tx.adminStaffInvite.update({
        where: { id: row.id },
        data: { acceptedAt: new Date() },
      });
      await tx.profileAuditLog.create({
        data: {
          // The accepting staffer's own id, not the inviter's — the same actor
          // split RECRUITER_INVITE_ACCEPTED makes, and for the same reason: at
          // accept time the only session in existence is the invitee's.
          userId: user.id,
          action: 'ADMIN_STAFF_INVITE_ACCEPTED',
          diff: { staffRole: row.staffRole } as unknown as Prisma.InputJsonValue,
        },
      });
      return { user, staffId: staff.id };
    });

    const session = await this.auth.issueSession(created.user, deviceInfo, ipAddress);
    return {
      user: created.user,
      staffId: created.staffId,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    };
  }

  // --- Internal helpers ----------------------------------------------------

  /**
   * The three existing-account branches of invite().
   *
   * Unlike the recruiter equivalent, "this address already has an account" is the
   * EXPECTED path here rather than an error case: CLAUDE.md §9 provisions admins
   * with a bare `UPDATE "User" SET role='ADMIN'`, so a colleague who already has
   * the role but no tier is precisely what a hand-promotion leaves behind.
   */
  private async inviteExistingUser(
    actorUserId: number,
    email: string,
    input: InviteStaffInput,
    existingUser: {
      id: number;
      role: string;
      adminStaff: { id: number; deactivatedAt: Date | null } | null;
    },
  ): Promise<InviteStaffResult> {
    const staff = existingUser.adminStaff;

    if (staff && staff.deactivatedAt === null) {
      throw new ConflictException('That email already belongs to an active staff member');
    }

    // A candidate or recruiter. Refused rather than converted: User.role is a
    // single scalar, so promoting them would change what their own account IS
    // and strand the candidate or recruiter profile hanging off it. This is the
    // same call the recruiter invite makes for an address belonging elsewhere.
    if (!staff && existingUser.role !== 'ADMIN') {
      throw new ConflictException(
        'That email belongs to an existing candidate or employer account and cannot be made staff. Use a different address.',
      );
    }

    const permissions = input.permissions
      ? resolveAdminPermissions(input.staffRole, input.permissions)
      : null;

    // Previously deactivated → restore in place. No token, no email: the account
    // and its password already exist, so there is nothing for the invitee to set.
    if (staff) {
      await prisma.$transaction(async (tx) => {
        await tx.adminStaff.update({
          where: { id: staff.id },
          data: {
            deactivatedAt: null,
            staffRole: input.staffRole,
            permissions:
              permissions === null
                ? Prisma.DbNull
                : (permissions as unknown as Prisma.InputJsonValue),
          },
        });
        await tx.user.update({ where: { id: existingUser.id }, data: { role: 'ADMIN' } });
        await tx.profileAuditLog.create({
          data: {
            userId: actorUserId,
            action: 'ADMIN_STAFF_REACTIVATED',
            diff: {
              targetStaffId: staff.id,
              targetEmail: email,
              staffRole: input.staffRole,
            } as unknown as Prisma.InputJsonValue,
          },
        });
      });
      return { status: 'reactivated', staffId: staff.id, email };
    }

    // An ADMIN with no staff row: grant the tier directly. No email for the same
    // reason as above — they can already sign in; what they lacked was a tier.
    const granted = await prisma.$transaction(async (tx) => {
      const row = await tx.adminStaff.create({
        data: {
          userId: existingUser.id,
          staffRole: input.staffRole,
          ...(permissions !== null
            ? { permissions: permissions as unknown as Prisma.InputJsonValue }
            : {}),
          createdById: actorUserId,
        },
        select: { id: true },
      });
      await tx.profileAuditLog.create({
        data: {
          userId: actorUserId,
          action: 'ADMIN_STAFF_INVITED',
          diff: {
            email,
            staffRole: input.staffRole,
            grantedToExistingAdmin: true,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      return row;
    });
    return { status: 'granted', staffId: granted.id, email };
  }

  /**
   * Fire-and-log the invite email AFTER the transaction has committed.
   *
   * Never awaited and never inside the transaction: a Resend or Redis hiccup must
   * not roll back or 5xx an invite that was created successfully. The raw token
   * lives only in this URL and in the recipient's inbox — it is not recoverable
   * from the database, which is why resend mints a new one.
   *
   * ⚠ A resolved enqueue is NOT proof of delivery. The transactional queue
   * log-and-drops when Redis is unreachable. That is why the console shows the
   * pending invite with a resend control rather than a "sent" confirmation.
   */
  private sendInviteEmail(email: string, rawToken: string): void {
    // SADMIN_URL is an ORIGIN and apps/sadmin sets basePath: '/sadmin', so the
    // prefix has to be written here explicitly. This is the exact inverse of the
    // rule inside that app, where next/link applies the prefix itself and writing
    // it produces /sadmin/sadmin/...
    const base = process.env.SADMIN_URL ?? 'http://localhost:3003';
    const inviteUrl = `${base}/sadmin/accept-invite/${encodeURIComponent(rawToken)}`;
    this.email
      .enqueueAdminStaffInvite(email, null, { inviteUrl, expiresInHours: INVITE_TTL_HOURS })
      .catch((err: unknown) => {
        this.logger.warn(
          `staff invite email to ${email} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  /**
   * Refuse any self-directed change.
   *
   * Stricter than the recruiter equivalent, which blocks only self-removal, and
   * deliberately so: there is no support team to call here and no second console
   * to recover from. A super admin who demotes or deactivates themselves has to
   * be restored by a direct DB write, and if they were the last one there is
   * nobody left who could authorise even that.
   */
  private assertNotSelf(actorUserId: number, targetUserId: number): void {
    if (actorUserId === targetUserId) {
      throw new ConflictException('You cannot change your own staff access');
    }
  }

  /**
   * Never strand the platform with zero super admins.
   *
   * Runs INSIDE the caller's transaction and takes a FOR UPDATE lock on the
   * active SUPER_ADMIN rows first, so two concurrent demotions serialise instead
   * of both reading the same pre-write snapshot and both passing — a TOCTOU that
   * would leave the console permanently unreachable by anyone.
   *
   * The raw query is here for its LOCK, not its result; the count comes from the
   * ordinary query below it. The enum literal must be cast explicitly — Postgres
   * cannot infer the type of a bare string in this position — and the identifiers
   * stay double-quoted because Prisma's table names are case-sensitive.
   */
  private async assertNotLastSuperAdmin(
    tx: Prisma.TransactionClient,
    excludingStaffId: number,
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT id FROM "AdminStaff"
      WHERE "staffRole" = 'SUPER_ADMIN'::"AdminStaffRole"
        AND "deactivatedAt" IS NULL
      FOR UPDATE`;
    const otherSuperAdmins = await tx.adminStaff.count({
      where: {
        staffRole: 'SUPER_ADMIN',
        deactivatedAt: null,
        id: { not: excludingStaffId },
      },
    });
    if (otherSuperAdmins === 0) {
      throw new ConflictException('The platform must keep at least one active super admin');
    }
  }

  private async assertRolesWriteEnabled(): Promise<void> {
    if (await isFlagEnabled(ROLES_WRITE_KILLSWITCH_FLAG)) {
      throw new ServiceUnavailableException('Staff provisioning is temporarily unavailable');
    }
  }

  private async assertEmailsEnabled(): Promise<void> {
    if (await isFlagEnabled(EMAILS_KILLSWITCH_FLAG)) {
      throw new ServiceUnavailableException(
        'Email is temporarily unavailable, so an invitation cannot be sent right now.',
      );
    }
  }
}
