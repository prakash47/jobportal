import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { prisma } from '@jobportal/db';
import type { Session, User } from '@jobportal/db';
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
  async register(input: RegisterInput): Promise<{ userId: number }> {
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
    return { userId: user.id };
  }

  async login(
    input: LoginInput,
    deviceInfo: string | undefined,
    ipAddress: string | undefined,
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    const ok = user
      ? await verifyPassword(input.password, user.passwordHash)
      : await verifyPassword(input.password, await dummyHash()).then(() => false);

    if (!user || !ok) throw new UnauthorizedException('Invalid email or password');

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

  async me(userId: number): Promise<{ user: User; sessions: Session[] }> {
    const [user, sessions] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.session.findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { lastUsedAt: 'desc' },
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
}
