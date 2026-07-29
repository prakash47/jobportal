import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { prisma, Prisma } from '@jobportal/db';

export interface RevealOtpResult {
  code: string;
  expiresAt: Date;
  verifiedAt: Date | null;
}

@Injectable()
export class AdminOtpSessionsService {
  private readonly logger = new Logger(AdminOtpSessionsService.name);

  // SRS §4.9 — reveal a live signup code so a Career Queue staff member can
  // relay it over the phone. With no SMS/email provider wired, the staff member
  // IS the delivery channel, which makes READING the code the sensitive act —
  // hence the audit row, and hence this being a POST rather than a GET (it has
  // a side effect, and a prefetcher must never trigger it).
  //
  // The read and the audit write share one transaction so the two can never
  // diverge: a reveal that returns digits without leaving an attributable trace
  // is exactly the failure this endpoint exists to prevent.
  async reveal(adminUserId: number, challengeId: number): Promise<RevealOtpResult> {
    const challenge = await prisma.$transaction(async (tx) => {
      const row = await tx.otpChallenge.findUnique({
        where: { id: challengeId },
        select: {
          id: true,
          code: true,
          channel: true,
          destination: true,
          expiresAt: true,
          verifiedAt: true,
        },
      });
      // Returned rather than thrown so the 404 leaves the transaction by the
      // normal path — there is nothing to roll back, and nothing was audited.
      if (!row) return null;

      await tx.profileAuditLog.create({
        data: {
          userId: adminUserId,
          action: 'OTP_CODE_REVEALED',
          // The challenge id, the channel and the destination — so an
          // investigation can tell WHOSE code was read and by whom. Never the
          // code itself: an audit table that stores the secret would defeat the
          // deletion-on-spend and the hourly purge that bound its lifetime.
          // Same minimisation rule KYC (GSTIN/PAN), job moderation and billing
          // already follow.
          diff: {
            challengeId: row.id,
            channel: row.channel,
            destination: row.destination,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      return row;
    });

    if (!challenge) throw new NotFoundException('No such OTP challenge');

    // Ids and the channel only — the code never reaches a log line, and neither
    // does the destination (it is PII, and the audit row already holds it).
    this.logger.log(
      `admin=${adminUserId} revealed otp challenge=${challenge.id} channel=${challenge.channel}`,
    );

    return {
      code: challenge.code,
      expiresAt: challenge.expiresAt,
      verifiedAt: challenge.verifiedAt,
    };
  }
}
