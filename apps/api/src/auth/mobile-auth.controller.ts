import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { EmailService } from '../email/email.service';
import { LoginDto, MobileRefreshDto, RegisterDto } from './dto';
import { PerEmailThrottleGuard } from './per-email-throttle.guard';

// ADR 0002 decision 1 — the mobile token surface.
//
// WHY THIS EXISTS AT ALL: `JwtAuthGuard` already accepts
// `Authorization: Bearer`, and every job-seeker controller sits behind it — so
// the entire authenticated API works for a phone the moment it holds a token.
// It had no way to GET one. `/auth/login` and friends emit the tokens ONLY via
// Set-Cookie and return `{ user }`, and `/auth/refresh` reads the refresh token
// exclusively from the cookie. The app could be asked for a credential it could
// not acquire.
//
// WHY A SEPARATE CONTROLLER rather than a body-token mode on `/auth/*`: those
// endpoints are consumed by apps/web, apps/recruiter and apps/sadmin. Adding a
// client-sniffing branch to them puts three shipped products one bad condition
// away from a broken login. This surface is additive — nothing here changes any
// existing route, and the browser contract is byte-untouched.
//
// DELIBERATE DIVERGENCE FROM CLAUDE.md §9, owner-approved and recorded in
// ADR 0002: §9 mandates HttpOnly cookies for session transport. A native client
// has no cookie jar, so on THIS surface (and only this one) the tokens are
// returned in the response body and the refresh token is accepted in the
// request body. The mitigations that make that acceptable are unchanged from
// the browser path: HS256, 15-minute access TTL, 30-day refresh, rotation on
// every use, and `assertSessionAllowed` inside `issueSession`.
//
// NOT DUPLICATED: every token decision still lives in AuthService. This
// controller only chooses where the tokens are written — cookies there, JSON
// here. `register`/`login`/`refresh`/`logout` are the same service calls the
// browser controller makes, with the same throttles.

function publicUser(user: {
  id: number;
  email: string;
  name: string;
  role: string;
  emailVerified: boolean;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: user.emailVerified,
  };
}

// The mobile session payload. `expiresIn` is SECONDS of access-token life, not
// an absolute timestamp: a device clock that is wrong (and on Android in India
// it routinely is) would make an absolute expiry either refresh on every call
// or never refresh at all. The same reasoning the reset-flow countdown uses.
const ACCESS_TTL_SECONDS = 15 * 60;

function session(result: {
  user: Parameters<typeof publicUser>[0];
  accessToken: string;
  refreshToken: string;
}) {
  return {
    user: publicUser(result.user),
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    tokenType: 'Bearer' as const,
    expiresIn: ACCESS_TTL_SECONDS,
  };
}

@Controller({ path: 'auth/mobile', version: '1' })
export class MobileAuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly emailVerify: EmailVerificationService,
    private readonly email: EmailService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: unknown, @Req() req: Request) {
    const parsed = RegisterDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);

    const result = await this.auth.register(
      parsed.data,
      req.headers['user-agent'] ? String(req.headers['user-agent']) : undefined,
      req.ip,
    );

    // Same swallow-and-continue posture as the browser controller: the account
    // and session are already committed, so an email failure must never 500 and
    // strand a created-but-"failed" account.
    //
    // Worth knowing on mobile specifically: the verification link this sends
    // points at the WEBSITE (`${WEB_URL}/verify-email?token=`), so a user who
    // registers in the app finishes verification in a browser. That is a known
    // gap, not an oversight — closing it needs deep-link/associated-domain
    // setup on the app side and is tracked in ADR 0002.
    try {
      await this.emailVerify.issueAndSend(result.user.id, parsed.data.email);
    } catch {
      // The email/queue layers log; no logger is injected into controllers.
    }
    this.email
      .enqueueRegistrationConfirmation(parsed.data.email, result.user.id, {
        name: parsed.data.name,
      })
      .catch(() => {
        // Cosmetic welcome email — a Redis blip must not fail registration.
      });

    return session(result);
  }

  // Same guards and limits as /auth/login. PerEmailThrottleGuard is NOT global,
  // so omitting it here would leave this the one unthrottled password endpoint
  // in the app — and an attacker picks the weakest of the two doors, not the
  // one we expect them to use.
  @Post('login')
  @UseGuards(PerEmailThrottleGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: unknown, @Req() req: Request) {
    const parsed = LoginDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);

    const result = await this.auth.login(
      parsed.data,
      req.headers['user-agent'] ? String(req.headers['user-agent']) : undefined,
      req.ip,
    );
    return session(result);
  }

  // Rotation is unchanged from the browser path: AuthService.refresh() revokes
  // the presented session and mints a new pair in one transaction. The client
  // must persist the NEW refresh token from this response — the old one is dead
  // the moment this returns 200.
  @Post('refresh')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: unknown, @Req() req: Request) {
    const parsed = MobileRefreshDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);

    const result = await this.auth.refresh(
      parsed.data.refreshToken,
      req.headers['user-agent'] ? String(req.headers['user-agent']) : undefined,
      req.ip,
    );
    return session(result);
  }

  // 204 on every outcome, including a token that is expired, already revoked or
  // simply garbage. Logout must be idempotent for a client that may be retrying
  // over a flaky connection, and a 401 here would tell an attacker holding a
  // stolen token whether it was still live.
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: unknown) {
    const parsed = MobileRefreshDto.safeParse(body);
    if (parsed.success) await this.auth.logout(parsed.data.refreshToken);
  }
}
