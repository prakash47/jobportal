import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@jobportal/db';
import { hashPassword, isStrongPassword } from '@jobportal/auth';
import { EmailService } from '../email/email.service';

// Per SRS §4.12.5 — 15-minute one-time password reset.
const RESET_TTL_MINUTES = 15;

function tokenHash(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class PasswordResetService {
  constructor(private readonly email: EmailService) {}

  async issueAndSend(email: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email } });
    // No-op when user does not exist — prevents email enumeration.
    if (!user) return;

    const raw = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: tokenHash(raw), expiresAt },
    });

    const base = process.env.WEB_URL ?? 'http://localhost:3000';
    const url = `${base}/reset-password?token=${encodeURIComponent(raw)}`;
    await this.email.sendPasswordReset(email, url);
  }

  async reset(token: string, newPassword: string): Promise<void> {
    if (!isStrongPassword(newPassword)) {
      throw new BadRequestException('Password too weak');
    }

    const row = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: tokenHash(token) },
    });
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await hashPassword(newPassword);

    // Atomic: consume token, update password, revoke all active sessions for
    // this user (a leaked refresh token can no longer be rotated).
    await prisma.$transaction([
      prisma.passwordResetToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: row.userId },
        data: { passwordHash },
      }),
      prisma.session.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }
}
