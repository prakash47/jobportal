import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { prisma, Prisma } from '@jobportal/db';
import { hashPassword, isStrongPassword, verifyPassword } from '@jobportal/auth';
import { AuthService } from '../auth/auth.service';
import type { ChangePasswordInput } from './dto';

// L3 killswitch — emergency stop for recruiter self-service password change. ON
// (enabled:true) means the feature is DISABLED. Checked before any password
// work so a flip takes effect without a redeploy (mirrors recruiter-kyc /
// recruiter-notifications).
const CHANGE_PASSWORD_KILLSWITCH_FLAG = 'killswitch.recruiter_change_password';

export interface ChangePasswordResult {
  // Fresh token pair for the CURRENT device — the caller sets these as cookies so
  // the recruiter stays signed in here after every prior session was revoked.
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class RecruiterPasswordService {
  constructor(private readonly auth: AuthService) {}

  // Change the authenticated recruiter's password. Verifies the current
  // password, sets the new hash, revokes ALL active sessions (so a leaked
  // refresh token anywhere is dead), then mints a fresh session for the current
  // device so the requester is not logged out of the tab they're using.
  async changePassword(
    userId: number,
    input: ChangePasswordInput,
    deviceInfo: string | undefined,
    ipAddress: string | undefined,
  ): Promise<ChangePasswordResult> {
    await this.assertEnabled();

    const { currentPassword, newPassword } = input;

    // The DTO already enforces both, but the service is the trusted boundary —
    // re-check so a future non-DTO caller can't slip a weak / identical password
    // through.
    if (!isStrongPassword(newPassword)) {
      throw new BadRequestException('Password too weak');
    }
    if (newPassword === currentPassword) {
      throw new BadRequestException('New password must be different from the current password');
    }

    // Full row: issueSession() below needs email/role/emailVerified. passwordHash
    // stays server-side — never returned to the client.
    const user = await prisma.user.findUnique({ where: { id: userId } });
    // JwtAuthGuard proved the token is valid, but the row could have been deleted
    // between issuing the token and this request.
    if (!user) throw new UnauthorizedException();

    // OAuth-only accounts (provider=GOOGLE) carry no local password to verify or
    // replace. Recruiters always register with a password today, so this is a
    // defensive guard for any future recruiter-OAuth path — never mint a second
    // login credential for a provider account (ADR 0001, same stance as reset).
    if (!user.passwordHash) {
      throw new ConflictException(
        'This account signs in with an external provider and has no password to change.',
      );
    }

    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('Current password is incorrect');

    const newHash = await hashPassword(newPassword);

    // Atomic: set the new hash + revoke every active session (including the
    // requester's own) + write the audit row. Passwords are never stored in the
    // audit diff — only the fact of the change + how many sessions were dropped.
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: newHash },
      });
      const { count } = await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.profileAuditLog.create({
        data: {
          userId,
          action: 'RECRUITER_PASSWORD_CHANGE',
          diff: { sessionsRevoked: count } as unknown as Prisma.InputJsonValue,
        },
      });
    });

    // Re-establish the current device: a brand-new session + HS256 pair. Every
    // prior session (including the one that made this call) was just revoked, so
    // without this the recruiter would be logged out of their own tab. Runs
    // after the commit — if it were to fail, the password is still changed and
    // the recruiter simply re-logs in with it (safe degradation).
    const fresh = await this.auth.issueSession(user, deviceInfo, ipAddress);
    return { accessToken: fresh.accessToken, refreshToken: fresh.refreshToken };
  }

  private async assertEnabled(): Promise<void> {
    if (await isFlagEnabled(CHANGE_PASSWORD_KILLSWITCH_FLAG)) {
      throw new ServiceUnavailableException('Password change is temporarily unavailable');
    }
  }
}
