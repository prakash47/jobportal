import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { prisma, type User } from '@jobportal/db';
import {
  type AccessClaims,
  hashJti,
  hashPassword,
  isStrongPassword,
  issueTokenPair,
} from '@jobportal/auth';
import { RecruiterOtpService } from './recruiter-otp.service';
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
  // Always true now: the signup OTP proved control of this exact address before
  // the account existed, so there is no unverified state to land in.
  workEmailVerified: true;
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class RecruiterRegistrationService {
  constructor(private readonly otp: RecruiterOtpService) {}

  async register(
    input: RegisterRecruiterInput,
    deviceInfo: string | undefined,
    ipAddress: string | undefined,
  ): Promise<RegisterRecruiterResult> {
    // L3 killswitch. First, so an emergency stop on signups is not something a
    // caller can get past by sending a bad password and reading the error.
    await this.otp.assertNewRegistrationsOpen();

    if (!isStrongPassword(input.password)) {
      throw new BadRequestException('Password too weak');
    }

    // Before the duplicate-email lookup on purpose. The 409 below is an
    // enumeration oracle by design (a registrant has to be told the address is
    // taken), so requiring proof of control over both the address and the
    // number first is what stops it being farmed by someone who owns neither.
    await this.otp.assertVerifiedPair(input.signupId, input.email, input.phone);

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

      // Spend the verified pair. This is the compare-and-swap that makes a
      // verified pair single-use: assertVerifiedPair() above only READ the
      // rows, so two register calls racing on one signupId both pass it —
      // only the one whose deleteMany actually removes both rows proceeds, and
      // the loser rolls back with nothing created. Deleting (rather than
      // stamping a consumedAt) also destroys the plaintext codes the instant
      // they stop being needed. See the OtpChallenge.verifiedAt comment.
      const spent = await tx.otpChallenge.deleteMany({
        where: { signupId: input.signupId, verifiedAt: { not: null } },
      });
      if (spent.count !== 2) {
        throw new ConflictException(
          'That verification has already been used. Please start again.',
        );
      }

      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          name: input.name,
          role: 'RECRUITER',
          phone: input.phone,
          // Set together with `phone`, which is what the "any path that writes
          // User.phone must reset phoneVerified" invariant in schema.prisma is
          // protecting: this is the one path where the number arriving and the
          // proof of control over it are the same event.
          phoneVerified: true,
          // The EMAIL challenge proved control of exactly this address, so the
          // account starts verified — there is no link left to click.
          emailVerified: true,
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
          // The single Email ID is the work email, and the OTP just proved
          // control of it — nothing further to verify before a first job post.
          workEmailVerified: true,
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

    // No work-email verification link is sent here any more. The signup OTP
    // already proved control of this exact address — the same mailbox the link
    // would have gone to — so a link would ask the recruiter to prove the same
    // thing twice. RecruiterWorkEmailService and its /verify-work-email
    // endpoint stay in place for the flows that still issue one.
    return {
      user: created.user,
      recruiterId: created.recruiterId,
      workEmailVerified: true,
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
    };
  }
}
