import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { prisma, type User } from '@jobportal/db';
import {
  type AccessClaims,
  hashJti,
  hashPassword,
  isStrongPassword,
  issueTokenPair,
} from '@jobportal/auth';
import { RecruiterWorkEmailService } from './recruiter-work-email.service';
import type { RegisterRecruiterInput } from './dto';

// SRS §4.9.1 — apps/api has no shared slugify yet; this is the same shape as
// apps/web/lib/url/slug.ts:slugify. Move to a shared package once another
// service needs it.
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export interface RegisterRecruiterResult {
  user: User;
  recruiterId: number;
  workEmailVerified: false;
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class RecruiterRegistrationService {
  private readonly logger = new Logger(RecruiterRegistrationService.name);

  constructor(private readonly workEmail: RecruiterWorkEmailService) {}

  async register(
    input: RegisterRecruiterInput,
    deviceInfo: string | undefined,
    ipAddress: string | undefined,
  ): Promise<RegisterRecruiterResult> {
    if (!isStrongPassword(input.password)) {
      throw new BadRequestException('Password too weak');
    }

    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await hashPassword(input.password);
    const slug = slugify(input.companyName);
    if (!slug) throw new BadRequestException('Company name has no slug-safe characters');

    // Create User + Company + Recruiter atomically. Registration creates a NEW
    // company and makes the registrant its OWNER (SRS §4.9 Team management).
    // Joining an EXISTING company is invite-only now — self-registering against a
    // taken slug is rejected so team membership stays controlled (an admin on
    // that team invites you instead). Token pair is created post-tx; the cookies
    // get set by the controller.
    const created = await prisma.$transaction(async (tx) => {
      const existingCompany = await tx.company.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (existingCompany) {
        throw new ConflictException(
          'A company with this name is already registered. Ask an admin on that team to invite you.',
        );
      }

      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          name: input.name,
          role: 'RECRUITER',
        },
      });

      const company = await tx.company.create({
        data: { slug, name: input.companyName },
      });

      const recruiter = await tx.recruiter.create({
        data: {
          userId: user.id,
          companyId: company.id,
          companyRole: 'OWNER',
          workEmailVerified: false,
        },
      });

      return { user, recruiterId: recruiter.id };
    });

    // Issue tokens + persist Session — same pattern as login. Session row
    // creation lives outside the transaction because the API is happy to
    // retry session creation on a transient blip.
    const claims: AccessClaims = {
      sub: created.user.id,
      email: created.user.email,
      role: created.user.role,
      emailVerified: created.user.emailVerified,
    };
    const pair = issueTokenPair(claims);
    await prisma.session.create({
      data: {
        userId: created.user.id,
        refreshTokenHash: hashJti(pair.refreshJti),
        deviceInfo: deviceInfo ?? null,
        ipAddress: ipAddress ?? null,
        expiresAt: pair.refreshExpiresAt,
      },
    });

    // Fire-and-log: do NOT block the response on the email backend. The
    // verification link goes to the single Email ID (the login address). If
    // send fails the recruiter can hit a /resend endpoint (lands with Task 16).
    // .catch() rather than `void` so a Resend failure logs cleanly instead
    // of triggering Node's unhandledRejection warning.
    this.workEmail
      .issueAndSend(created.recruiterId, input.email)
      .catch((err: unknown) => {
        this.logger.warn(
          `recruiter ${created.recruiterId} work-email send failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });

    return {
      user: created.user,
      recruiterId: created.recruiterId,
      workEmailVerified: false,
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
    };
  }
}
