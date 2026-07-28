import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { prisma } from '@jobportal/db';
import type { User } from '@jobportal/db';
import {
  type AccessClaims,
  hashJti,
  hashPassword,
  isStrongPassword,
  issueTokenPair,
  verifyPassword,
  verifyRefreshToken,
} from '@jobportal/auth';
import type { LoginInput, RegisterInput } from './dto';

// Constant-time-ish login: even when the user does not exist, run a real
// argon2 verify against this dummy hash so the response time leaks nothing.
let dummyHashCache: string | null = null;
async function dummyHash(): Promise<string> {
  if (!dummyHashCache) {
    dummyHashCache = await hashPassword('NEVER_USE_THIS_DUMMY_PASSWORD_xy_2026');
  }
  return dummyHashCache;
}

@Injectable()
export class AuthService {
  // Registration auto-logs the new seeker in (issues a session) so they land
  // straight on the onboarding step — no separate sign-in. Email verification
  // still fires from the controller and gates applying/posting per FR-4.12.8.
  async register(
    input: RegisterInput,
    deviceInfo: string | undefined,
    ipAddress: string | undefined,
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    if (!isStrongPassword(input.password)) {
      throw new BadRequestException('Password too weak');
    }

    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await hashPassword(input.password);
    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
        phone: input.phone ?? null,
        role: 'CANDIDATE',
      },
    });
    return this.issueSession(user, deviceInfo, ipAddress);
  }

  // Timing-safe credential check shared by every password-login entry point
  // (/auth/login and /auth/admin/login). Extracted rather than duplicated so
  // the dummy-hash timing defence and the OAuth-only rejection can never drift
  // apart between the two endpoints.
  private async verifyCredentials(input: LoginInput): Promise<User> {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    // OAuth-only users have passwordHash === null — password login must never
    // succeed for them. Still run a dummy verify so timing leaks nothing.
    const ok =
      user && user.passwordHash
        ? await verifyPassword(input.password, user.passwordHash)
        : await verifyPassword(input.password, await dummyHash()).then(() => false);

    if (!user || !ok) throw new UnauthorizedException('Invalid email or password');
    return user;
  }

  /**
   * ADMIN-only password login, used by the internal Super Admin portal
   * (apps/sadmin). Exists because `login()` performs NO role check — a
   * CANDIDATE posting to the sadmin sign-in form would otherwise receive a
   * perfectly valid session on the admin origin, and only be stopped later by
   * the portal's own page gate. An internal console should not mint a session
   * at all for someone who can never use it.
   */
  async adminLogin(
    input: LoginInput,
    deviceInfo: string | undefined,
    ipAddress: string | undefined,
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const user = await this.verifyCredentials(input);

    // Ordering is deliberate and mirrors the recruiter-deactivation check in
    // login(): the role is inspected only AFTER the password has been verified.
    // Rejecting non-admins earlier would answer "is this address an admin?" for
    // anyone who can send a request, and the message is byte-identical to a
    // wrong password for exactly the same reason.
    if (user.role !== 'ADMIN') throw new UnauthorizedException('Invalid email or password');

    return this.issueSession(user, deviceInfo, ipAddress);
  }

  async login(
    input: LoginInput,
    deviceInfo: string | undefined,
    ipAddress: string | undefined,
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const user = await this.verifyCredentials(input);

    // A recruiter removed from their team (soft-deactivated) is blocked from
    // re-authenticating — their existing sessions were already revoked at
    // removal (SRS §4.9). Scoped strictly to RECRUITER so candidate/admin login
    // is byte-unchanged; runs only after credentials verify, so it leaks nothing.
    if (user.role === 'RECRUITER') {
      const rec = await prisma.recruiter.findUnique({
        where: { userId: user.id },
        select: { deactivatedAt: true },
      });
      if (rec?.deactivatedAt) {
        throw new ForbiddenException(
          'This recruiter account has been deactivated. Contact your team administrator.',
        );
      }
    }

    return this.issueSession(user, deviceInfo, ipAddress);
  }

  // Mint an access + refresh token pair for an already-authenticated user and
  // persist the refresh session. The single place that turns "this is user X"
  // into the source tokens for our HS256 cookies — shared by password login and
  // Google OAuth. (refresh() keeps its own minting: rotation must atomically
  // revoke the old session in the same transaction.)
  async issueSession(
    user: User,
    deviceInfo: string | undefined,
    ipAddress: string | undefined,
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const claims: AccessClaims = {
      sub: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
    };
    const pair = issueTokenPair(claims);

    await prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: hashJti(pair.refreshJti),
        deviceInfo: deviceInfo ?? null,
        ipAddress: ipAddress ?? null,
        expiresAt: pair.refreshExpiresAt,
      },
    });

    return { user, accessToken: pair.accessToken, refreshToken: pair.refreshToken };
  }

  async refresh(
    refreshToken: string,
    deviceInfo: string | undefined,
    ipAddress: string | undefined,
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await prisma.session.findUnique({
      where: { refreshTokenHash: hashJti(payload.jti) },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session not active');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const claims: AccessClaims = {
      sub: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
    };
    const pair = issueTokenPair(claims);

    // Rotate per SRS §4.12.4 — atomically revoke old, create new.
    await prisma.$transaction([
      prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      }),
      prisma.session.create({
        data: {
          userId: user.id,
          refreshTokenHash: hashJti(pair.refreshJti),
          deviceInfo: deviceInfo ?? null,
          ipAddress: ipAddress ?? null,
          expiresAt: pair.refreshExpiresAt,
        },
      }),
    ]);

    return { user, accessToken: pair.accessToken, refreshToken: pair.refreshToken };
  }

  async logout(refreshToken: string): Promise<void> {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      return;
    }
    await prisma.session
      .updateMany({
        where: { refreshTokenHash: hashJti(payload.jti), revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }

  async me(userId: number): Promise<{
    user: {
      id: number;
      email: string;
      name: string;
      phone: string | null;
      emailVerified: boolean;
      role: User['role'];
      createdAt: Date;
      updatedAt: Date;
    };
    sessions: Array<{
      id: number;
      deviceInfo: string | null;
      ipAddress: string | null;
      createdAt: Date;
      lastUsedAt: Date;
      expiresAt: Date;
    }>;
  }> {
    // Per CLAUDE.md §9: passwordHash and refreshTokenHash MUST never
    // leave the server. Explicit field selection here so a Prisma model
    // change doesn't accidentally widen the response shape.
    const [user, sessions] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          emailVerified: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.session.findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { lastUsedAt: 'desc' },
        select: {
          id: true,
          deviceInfo: true,
          ipAddress: true,
          createdAt: true,
          lastUsedAt: true,
          expiresAt: true,
        },
      }),
    ]);
    if (!user) throw new UnauthorizedException();
    return { user, sessions };
  }

  async revokeSession(userId: number, sessionId: number): Promise<void> {
    await prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // Update the authenticated user's display name. Used by the Google-signup
  // onboarding step (name is prefilled from Google but editable). Email is NOT
  // updatable here — onboarding locks it.
  async updateName(userId: number, name: string): Promise<{ id: number; name: string }> {
    return prisma.user.update({
      where: { id: userId },
      data: { name },
      select: { id: true, name: true },
    });
  }
}
