import { BadRequestException, Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { prisma } from '@jobportal/db';
import { EmailService } from '../email/email.service';

const TTL_SECONDS = 24 * 60 * 60;
const PURPOSE = 'recruiter-work-email';

interface VerificationClaims {
  sub: number; // recruiterId
  purpose: string;
}

@Injectable()
export class RecruiterWorkEmailService {
  constructor(private readonly email: EmailService) {}

  // Namespace the secret so an access token can never accidentally be
  // accepted as a verification token, AND so a candidate-flow email-verify
  // token can never be accepted as a recruiter-flow token.
  private secret(): string {
    const s = process.env.JWT_ACCESS_SECRET;
    if (!s) throw new Error('JWT_ACCESS_SECRET not set');
    return `${s}:recruiter-work-email`;
  }

  // `email` is the recruiter's single Email ID (the login address); the link
  // verifies the recruiter controls that mailbox before any job-post can land.
  async issueAndSend(recruiterId: number, email: string): Promise<void> {
    const token = jwt.sign(
      { sub: recruiterId, purpose: PURPOSE } satisfies VerificationClaims,
      this.secret(),
      { algorithm: 'HS256', expiresIn: TTL_SECONDS },
    );
    const base = process.env.RECRUITER_URL ?? 'http://localhost:3001';
    const url = `${base}/verify-email/${encodeURIComponent(token)}`;
    // userId=null because email_verification is mandatory (no preference
    // gating); skipping the recruiter→user lookup keeps the hot path lean.
    await this.email.enqueueEmailVerification(email, null, { verifyUrl: url });
  }

  // Idempotent: re-clicking the link after success is a no-op that still
  // returns recruiterId so the landing page can render the confirmation
  // state consistently.
  async verify(token: string): Promise<{ recruiterId: number }> {
    let claims: VerificationClaims;
    try {
      const decoded = jwt.verify(token, this.secret(), { algorithms: ['HS256'] });
      if (typeof decoded !== 'object' || decoded === null) throw new Error('non-object');
      claims = decoded as unknown as VerificationClaims;
    } catch {
      throw new BadRequestException('Invalid or expired verification token');
    }
    if (claims.purpose !== PURPOSE) {
      throw new BadRequestException('Token purpose mismatch');
    }
    const recruiterId = Number(claims.sub);
    if (!Number.isFinite(recruiterId)) {
      throw new BadRequestException('Token payload malformed');
    }

    await prisma.recruiter.update({
      where: { id: recruiterId },
      data: { workEmailVerified: true },
    });

    return { recruiterId };
  }
}
