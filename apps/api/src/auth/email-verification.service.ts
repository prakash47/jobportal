import { BadRequestException, Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { prisma } from '@jobportal/db';
import { EmailService } from '../email/email.service';

const EMAIL_VERIFY_TTL_SECONDS = 24 * 60 * 60;

@Injectable()
export class EmailVerificationService {
  constructor(private readonly email: EmailService) {}

  // Namespace the verification secret so an access token can never accidentally
  // be accepted as a verification token.
  private secret(): string {
    const s = process.env.JWT_ACCESS_SECRET;
    if (!s) throw new Error('JWT_ACCESS_SECRET not set');
    return `${s}:email-verify`;
  }

  async issueAndSend(userId: number, email: string): Promise<void> {
    const token = jwt.sign({ sub: userId }, this.secret(), {
      algorithm: 'HS256',
      expiresIn: EMAIL_VERIFY_TTL_SECONDS,
    });
    const base = process.env.WEB_URL ?? 'http://localhost:3000';
    const url = `${base}/verify-email?token=${encodeURIComponent(token)}`;
    await this.email.sendEmailVerification(email, url);
  }

  async verify(token: string): Promise<number> {
    let userId: number;
    try {
      const decoded = jwt.verify(token, this.secret(), { algorithms: ['HS256'] }) as {
        sub: number;
      };
      userId = Number(decoded.sub);
      if (!Number.isFinite(userId)) throw new Error();
    } catch {
      throw new BadRequestException('Invalid or expired verification token');
    }
    await prisma.user.update({ where: { id: userId }, data: { emailVerified: true } });
    return userId;
  }
}
