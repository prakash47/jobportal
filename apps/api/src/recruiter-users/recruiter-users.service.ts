import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { prisma, Prisma } from '@jobportal/db';
import type { RecruiterRole, User } from '@jobportal/db';
import { hashPassword, isStrongPassword } from '@jobportal/auth';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../email/email.service';
import { buildDiff, isDiffEmpty } from '../profile/audit';
import { resolvePermissions, type PermissionMap } from './permissions';
import type { AcceptInviteInput, InviteUserInput, UpdateUserInput } from './dto';

// L3 killswitch — emergency stop for the whole Team / User-management feature.
// ON (enabled:true) means DISABLED. Asserted before every mutation (and the
// public invite-preview / accept) so a flip takes effect without a redeploy.
const USER_MGMT_KILLSWITCH_FLAG = 'killswitch.recruiter_user_management';

// Invites are valid for 3 days — long enough for a teammate to notice the email,
// short enough that a leaked-and-forgotten link stops working.
const INVITE_TTL_HOURS = 72;

function tokenHash(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export interface PendingInviteSummary {
  id: number;
  email: string;
  companyRole: RecruiterRole;
  expiresAt: Date;
  createdAt: Date;
}

// invite() either emails a fresh invite (new email) or directly reactivates a
// previously-removed teammate of the same company (their account already exists).
export type InviteResult =
  | { status: 'invited'; invite: PendingInviteSummary }
  | { status: 'reactivated'; recruiterId: number; email: string };

export interface MemberPermissionResult {
  id: number;
  companyRole: RecruiterRole;
  permissions: PermissionMap;
}

export type InvitePreview =
  | { valid: false }
  | { valid: true; email: string; companyName: string; companyRole: RecruiterRole };

export interface AcceptInviteResult {
  user: User;
  recruiterId: number;
  accessToken: string;
  refreshToken: string;
}

interface CallerContext {
  id: number;
  companyId: number;
  companyRole: RecruiterRole;
  companyName: string;
  name: string;
}

@Injectable()
export class RecruiterUsersService {
  private readonly logger = new Logger(RecruiterUsersService.name);

  constructor(
    private readonly auth: AuthService,
    private readonly email: EmailService,
  ) {}

  // --- Mutations (authenticated, L3-trusted) -------------------------------

  async invite(userId: number, input: InviteUserInput): Promise<InviteResult> {
    await this.assertEnabled();
    const caller = await this.getCaller(userId);
    this.assertCanManageTeam(caller.companyRole);
    this.assertCanGrantRole(caller.companyRole, input.companyRole);

    const email = input.email; // already lowercased by the DTO

    // Does an account already exist for this email? A Recruiter is 1:1 with a
    // User, so a user is in at most one company. Consult the User table up front
    // so we never create-and-email an invite that acceptInvite() could only 409
    // on (accept creates a NEW account; it can't link an existing one).
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        recruiter: { select: { id: true, companyId: true, deactivatedAt: true } },
      },
    });

    if (existingUser) {
      const rec = existingUser.recruiter;
      if (rec && rec.companyId === caller.companyId) {
        if (rec.deactivatedAt === null) {
          throw new ConflictException('That email is already a member of your team');
        }
        // A previously-removed teammate → reactivate their existing account
        // directly (no email round-trip), applying the invited role/permissions.
        // This is how removal is reversible (schema.prisma Recruiter.deactivatedAt).
        const permissions = input.permissions
          ? resolvePermissions(input.companyRole, input.permissions)
          : null;
        await prisma.$transaction(async (tx) => {
          await tx.recruiter.update({
            where: { id: rec.id },
            data: {
              deactivatedAt: null,
              companyRole: input.companyRole,
              permissions:
                permissions === null
                  ? Prisma.DbNull
                  : (permissions as unknown as Prisma.InputJsonValue),
            },
          });
          await tx.profileAuditLog.create({
            data: {
              userId,
              action: 'RECRUITER_USER_INVITED',
              diff: {
                email,
                companyRole: input.companyRole,
                reactivated: true,
              } as unknown as Prisma.InputJsonValue,
            },
          });
        });
        return { status: 'reactivated', recruiterId: rec.id, email };
      }
      // The email belongs to a candidate, or a recruiter at another company —
      // accept can't link it, so reject at invite time rather than send a dead
      // link. (Linking an existing account to a company is a Phase-2 follow-up.)
      throw new ConflictException(
        'An account with this email already exists and can’t be invited. Ask them to sign in, or use a different email.',
      );
    }

    const raw = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3_600_000);
    // Only persist an explicit permission map when overrides were provided; null
    // means "derive from the role defaults at read time" (keeps role defaults live).
    const permissions = input.permissions
      ? resolvePermissions(input.companyRole, input.permissions)
      : null;

    const invite = await prisma.$transaction(async (tx) => {
      // Supersede any prior still-pending invite for this email+company (one
      // active invite per email; no partial-unique is expressible in Prisma).
      await tx.recruiterInvite.updateMany({
        where: { companyId: caller.companyId, email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const created = await tx.recruiterInvite.create({
        data: {
          companyId: caller.companyId,
          email,
          companyRole: input.companyRole,
          // Omit the key entirely when there are no overrides (null → derive from
          // role at read time); passing `undefined` violates exactOptionalPropertyTypes.
          ...(permissions !== null
            ? { permissions: permissions as unknown as Prisma.InputJsonValue }
            : {}),
          tokenHash: tokenHash(raw),
          invitedByUserId: userId,
          expiresAt,
        },
        select: { id: true, email: true, companyRole: true, expiresAt: true, createdAt: true },
      });
      await tx.profileAuditLog.create({
        data: {
          userId,
          action: 'RECRUITER_USER_INVITED',
          diff: { email, companyRole: input.companyRole } as unknown as Prisma.InputJsonValue,
        },
      });
      return created;
    });

    // Fire-and-log the invite email AFTER the commit (only for a brand-new email) — a Resend hiccup must never
    // roll back or 5xx the invite creation (the raw token lives only in the URL).
    const base = process.env.RECRUITER_URL ?? 'http://localhost:3001';
    const inviteUrl = `${base}/accept-invite/${encodeURIComponent(raw)}`;
    this.email
      .enqueueRecruiterInvite(email, null, {
        inviteUrl,
        companyName: caller.companyName,
        inviterName: caller.name,
        expiresInHours: INVITE_TTL_HOURS,
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `invite email to ${email} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    return { status: 'invited', invite };
  }

  async revokeInvite(userId: number, inviteId: number): Promise<void> {
    await this.assertEnabled();
    const caller = await this.getCaller(userId);
    this.assertCanManageTeam(caller.companyRole);

    const invite = await prisma.recruiterInvite.findUnique({
      where: { id: inviteId },
      select: { id: true, companyId: true, email: true, acceptedAt: true, revokedAt: true },
    });
    // Not-found OR not-owned both 404 so a caller can't probe other companies' ids.
    if (!invite || invite.companyId !== caller.companyId) {
      throw new NotFoundException('Invitation not found');
    }
    if (invite.acceptedAt) throw new ConflictException('That invitation was already accepted');
    if (invite.revokedAt) return; // idempotent

    await prisma.$transaction(async (tx) => {
      await tx.recruiterInvite.update({
        where: { id: invite.id },
        data: { revokedAt: new Date() },
      });
      await tx.profileAuditLog.create({
        data: {
          userId,
          action: 'RECRUITER_INVITE_REVOKED',
          diff: { email: invite.email } as unknown as Prisma.InputJsonValue,
        },
      });
    });
  }

  async updateUser(
    userId: number,
    recruiterId: number,
    input: UpdateUserInput,
  ): Promise<MemberPermissionResult> {
    await this.assertEnabled();
    const caller = await this.getCaller(userId);
    this.assertCanManageTeam(caller.companyRole);

    const target = await prisma.recruiter.findUnique({
      where: { id: recruiterId },
      select: {
        id: true,
        companyId: true,
        companyRole: true,
        permissions: true,
        deactivatedAt: true,
        user: { select: { email: true } },
      },
    });
    if (!target || target.companyId !== caller.companyId || target.deactivatedAt) {
      throw new NotFoundException('Team member not found');
    }
    this.assertCanManageTarget(caller.companyRole, target.companyRole);

    const roleChanged = input.companyRole !== undefined && input.companyRole !== target.companyRole;
    const newRole: RecruiterRole = input.companyRole ?? target.companyRole;

    if (roleChanged) {
      this.assertCanGrantRole(caller.companyRole, newRole);
    }
    const demotingOwner = roleChanged && target.companyRole === 'OWNER' && newRole !== 'OWNER';

    // Effective before/after maps for the audit diff + the response.
    const beforePerms = resolvePermissions(target.companyRole, target.permissions);
    let afterPerms: PermissionMap;
    let permissionsData: Prisma.InputJsonValue | typeof Prisma.DbNull | undefined;
    if (input.permissions) {
      afterPerms = resolvePermissions(newRole, input.permissions);
      permissionsData = afterPerms as unknown as Prisma.InputJsonValue;
    } else if (roleChanged) {
      // Role changed with no explicit overrides → reset to the new role's defaults.
      afterPerms = resolvePermissions(newRole, null);
      permissionsData = Prisma.DbNull;
    } else {
      afterPerms = resolvePermissions(newRole, target.permissions);
      permissionsData = undefined;
    }

    const data: Prisma.RecruiterUpdateInput = {};
    if (input.companyRole !== undefined) data.companyRole = input.companyRole;
    if (permissionsData !== undefined) data.permissions = permissionsData;

    const before = { companyRole: target.companyRole, ...beforePerms };
    const after = { companyRole: newRole, ...afterPerms };
    const diff = buildDiff(before, after);
    const action = roleChanged
      ? 'RECRUITER_USER_ROLE_CHANGED'
      : 'RECRUITER_USER_PERMISSIONS_CHANGED';

    await prisma.$transaction(async (tx) => {
      // Never demote the final remaining owner into a lockout. Checked inside the
      // tx under a row lock so two concurrent demotions/removals can't both pass.
      if (demotingOwner) {
        await this.assertNotLastOwner(tx, target.companyId, target.id);
      }
      await tx.recruiter.update({ where: { id: target.id }, data });
      if (!isDiffEmpty(diff)) {
        await tx.profileAuditLog.create({
          data: {
            userId,
            action,
            diff: {
              targetRecruiterId: target.id,
              targetEmail: target.user.email,
              changes: diff,
            } as unknown as Prisma.InputJsonValue,
          },
        });
      }
    });

    return { id: target.id, companyRole: newRole, permissions: afterPerms };
  }

  async removeUser(userId: number, recruiterId: number): Promise<void> {
    await this.assertEnabled();
    const caller = await this.getCaller(userId);
    this.assertCanManageTeam(caller.companyRole);

    const target = await prisma.recruiter.findUnique({
      where: { id: recruiterId },
      select: {
        id: true,
        companyId: true,
        companyRole: true,
        deactivatedAt: true,
        userId: true,
        user: { select: { email: true } },
      },
    });
    if (!target || target.companyId !== caller.companyId) {
      throw new NotFoundException('Team member not found');
    }
    // Self-removal would risk an owner locking themselves (and the team) out.
    if (target.id === caller.id) {
      throw new ConflictException('You cannot remove yourself from the team');
    }
    this.assertCanManageTarget(caller.companyRole, target.companyRole);
    if (target.deactivatedAt) return; // idempotent

    await prisma.$transaction(async (tx) => {
      // Never remove the final remaining owner. Checked inside the tx under a row
      // lock so two concurrent owner removals can't both pass (TOCTOU).
      if (target.companyRole === 'OWNER') {
        await this.assertNotLastOwner(tx, target.companyId, target.id);
      }
      await tx.recruiter.update({
        where: { id: target.id },
        data: { deactivatedAt: new Date() },
      });
      // Immediately kill their sessions so the removal takes effect now (the
      // 15-min access token can linger until it expires — the same accepted
      // trade-off as the change-password flow; all mutations re-check membership).
      await tx.session.updateMany({
        where: { userId: target.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.profileAuditLog.create({
        data: {
          userId,
          action: 'RECRUITER_USER_REMOVED',
          diff: {
            targetRecruiterId: target.id,
            targetEmail: target.user.email,
            companyRole: target.companyRole,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    });
  }

  // --- Public invite endpoints (token IS the capability) -------------------

  // Read-only preview so the (public) accept page can render "you've been invited
  // to join {company} as {role}" before the invitee commits. Never returns the token.
  async previewInvite(token: string): Promise<InvitePreview> {
    await this.assertEnabled();
    const row = await prisma.recruiterInvite.findUnique({
      where: { tokenHash: tokenHash(token) },
      select: {
        email: true,
        companyRole: true,
        acceptedAt: true,
        revokedAt: true,
        expiresAt: true,
        company: { select: { name: true } },
      },
    });
    if (!row || row.revokedAt || row.acceptedAt || row.expiresAt < new Date()) {
      return { valid: false };
    }
    return {
      valid: true,
      email: row.email,
      companyName: row.company.name,
      companyRole: row.companyRole,
    };
  }

  // Accept an invitation: create the teammate's User + Recruiter, consume the
  // invite, and auto-log them in. POST (it mutates) — never GET, so an email
  // scanner / link prefetcher can't silently consume the invite.
  async acceptInvite(
    input: AcceptInviteInput,
    deviceInfo: string | undefined,
    ipAddress: string | undefined,
  ): Promise<AcceptInviteResult> {
    await this.assertEnabled();
    if (!isStrongPassword(input.password)) throw new BadRequestException('Password too weak');

    const row = await prisma.recruiterInvite.findUnique({
      where: { tokenHash: tokenHash(input.token) },
      select: {
        id: true,
        email: true,
        companyId: true,
        companyRole: true,
        permissions: true,
        acceptedAt: true,
        revokedAt: true,
        expiresAt: true,
      },
    });
    if (!row || row.revokedAt || row.acceptedAt || row.expiresAt < new Date()) {
      throw new BadRequestException('This invitation is invalid or has expired');
    }

    // Accept only ever CREATES a new account (mirrors registration's conflict
    // semantics). Linking an existing account to a company is a follow-up.
    const existing = await prisma.user.findUnique({
      where: { email: row.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'An account with this email already exists. Please sign in instead.',
      );
    }

    const passwordHash = await hashPassword(input.password);

    const created = await prisma.$transaction(async (tx) => {
      // Re-check inside the tx to serialise a double-accept race on the same link.
      const fresh = await tx.recruiterInvite.findUnique({
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
          role: 'RECRUITER',
          // Accepting the emailed link proves they control the mailbox.
          emailVerified: true,
        },
      });
      const recruiter = await tx.recruiter.create({
        data: {
          userId: user.id,
          companyId: row.companyId,
          companyRole: row.companyRole,
          ...(row.permissions !== null
            ? { permissions: row.permissions as unknown as Prisma.InputJsonValue }
            : {}),
          workEmailVerified: true,
        },
        select: { id: true },
      });
      await tx.recruiterInvite.update({
        where: { id: row.id },
        data: { acceptedAt: new Date() },
      });
      await tx.profileAuditLog.create({
        data: {
          userId: user.id,
          action: 'RECRUITER_INVITE_ACCEPTED',
          diff: {
            companyId: row.companyId,
            companyRole: row.companyRole,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      return { user, recruiterId: recruiter.id };
    });

    const session = await this.auth.issueSession(created.user, deviceInfo, ipAddress);
    return {
      user: created.user,
      recruiterId: created.recruiterId,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    };
  }

  // --- Internal helpers ----------------------------------------------------

  private async getCaller(userId: number): Promise<CallerContext> {
    const rec = await prisma.recruiter.findUnique({
      where: { userId },
      select: {
        id: true,
        companyId: true,
        companyRole: true,
        deactivatedAt: true,
        company: { select: { name: true } },
        user: { select: { name: true } },
      },
    });
    if (!rec) throw new NotFoundException('Recruiter profile not found');
    if (rec.deactivatedAt) {
      throw new ForbiddenException('Your account has been deactivated');
    }
    return {
      id: rec.id,
      companyId: rec.companyId,
      companyRole: rec.companyRole,
      companyName: rec.company.name,
      name: rec.user.name,
    };
  }

  // Only OWNER/ADMIN may manage the team at all.
  private assertCanManageTeam(role: RecruiterRole): void {
    if (role !== 'OWNER' && role !== 'ADMIN') {
      throw new ForbiddenException('Only owners and admins can manage the team');
    }
  }

  // OWNER can grant any role; ADMIN can only grant MEMBER (never mint OWNER/ADMIN).
  private assertCanGrantRole(callerRole: RecruiterRole, targetRole: RecruiterRole): void {
    if (callerRole === 'OWNER') return;
    if (callerRole === 'ADMIN' && targetRole === 'MEMBER') return;
    throw new ForbiddenException('You do not have permission to grant that role');
  }

  // OWNER can act on anyone; ADMIN can act only on MEMBERs (not owners/other admins).
  private assertCanManageTarget(callerRole: RecruiterRole, targetRole: RecruiterRole): void {
    if (callerRole === 'OWNER') return;
    if (callerRole === 'ADMIN' && targetRole === 'MEMBER') return;
    throw new ForbiddenException('You do not have permission to manage this team member');
  }

  // Guards against stranding a company with zero owners. Runs INSIDE the caller's
  // transaction and takes a FOR UPDATE lock on the company's active owner rows, so
  // two concurrent owner removals/demotions serialise instead of both passing the
  // check (a TOCTOU that would otherwise leave the company permanently ownerless).
  private async assertNotLastOwner(
    tx: Prisma.TransactionClient,
    companyId: number,
    excludingRecruiterId: number,
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT id FROM "Recruiter"
      WHERE "companyId" = ${companyId}
        AND "companyRole" = 'OWNER'::"RecruiterRole"
        AND "deactivatedAt" IS NULL
      FOR UPDATE`;
    const otherOwners = await tx.recruiter.count({
      where: {
        companyId,
        companyRole: 'OWNER',
        deactivatedAt: null,
        id: { not: excludingRecruiterId },
      },
    });
    if (otherOwners === 0) {
      throw new ConflictException('Your company must keep at least one owner');
    }
  }

  private async assertEnabled(): Promise<void> {
    if (await isFlagEnabled(USER_MGMT_KILLSWITCH_FLAG)) {
      throw new ServiceUnavailableException('Team management is temporarily unavailable');
    }
  }
}
