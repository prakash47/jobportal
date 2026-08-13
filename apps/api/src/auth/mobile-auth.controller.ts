import {
  BadRequestException,
  UnauthorizedException,
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
import { LoginDto, MobileAppleDto, MobileGoogleDto, MobileRefreshDto, RegisterDto } from './dto';
import { AppleIdentityService } from './apple-identity.service';
import { GoogleOAuthService } from './google-oauth.service';
import {
  APPLE_OIDC,
  GOOGLE_OIDC,
  OidcVerificationError,
  OidcVerifierService,
} from './oidc-verifier.service';
import { appleAudiences, googleAudiences } from './social-client-ids';
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
    private readonly oidc: OidcVerifierService,
    private readonly google: GoogleOAuthService,
    private readonly apple: AppleIdentityService,
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

  // ---- Social sign-in ------------------------------------------------------
  //
  // The browser flow at /auth/google cannot serve a native client: its PKCE
  // handshake is carried in an HttpOnly cookie, the session comes back as
  // Set-Cookie, and it finishes by redirecting to the WEBSITE — so an app gets
  // an error page and no tokens. These routes take the opposite shape: the
  // client does the provider dance on-device and posts the resulting ID token,
  // and we return body tokens exactly like /login.
  //
  // EVERY failure answers the same generic 401. The verifier distinguishes a
  // bad signature from a wrong audience from an expired token, and the caller
  // gets none of that — the distinctions are free reconnaissance for someone
  // probing which of their forged tokens got closest.

  @Post('google')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async googleSignIn(@Body() body: unknown, @Req() req: Request) {
    const parsed = MobileGoogleDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);

    const claims = await this.verifyOrUnauthorized(parsed.data.idToken, {
      jwksUri: GOOGLE_OIDC.jwksUri,
      issuers: GOOGLE_OIDC.issuers,
      audiences: googleAudiences(),
    });

    // The browser path enforces this inside parseIdToken; enforce it here too
    // rather than inheriting it, because linking by email below is only safe
    // when the provider actually vouched for the address.
    if (!claims.email || !claims.emailVerified) {
      throw new UnauthorizedException('Google account email is not verified.');
    }

    const { user } = await this.google.findOrCreateUser({
      sub: claims.sub,
      email: claims.email,
      name: claims.name?.trim() || (claims.email.split('@')[0] ?? claims.email),
      picture: claims.picture ?? null,
    });

    return session(await this.issueFor(user, req));
  }

  @Post('apple')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async appleSignIn(@Body() body: unknown, @Req() req: Request) {
    const parsed = MobileAppleDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);

    const claims = await this.verifyOrUnauthorized(parsed.data.idToken, {
      jwksUri: APPLE_OIDC.jwksUri,
      issuers: APPLE_OIDC.issuers,
      audiences: appleAudiences(),
    });

    const outcome = await this.apple.findOrCreateUser(claims, parsed.data.name);
    if (outcome.user === null) {
      // Apple omits the email claim on repeat sign-ins. Harmless once we know
      // the `sub`, fatal when creating, since User.email is required and
      // unique. A 401 would be misleading — the token was perfectly valid —
      // so this is a 400 telling the client to send the user through Apple's
      // first-time consent again.
      throw new BadRequestException(
        'Apple did not provide an email address for this account. ' +
          'Remove Career Queue from your Apple ID and sign in again.',
      );
    }

    return session(await this.issueFor(outcome.user, req));
  }

  /** Verify an ID token, collapsing every rejection into one opaque 401. */
  private async verifyOrUnauthorized(
    idToken: string,
    opts: Parameters<OidcVerifierService['verify']>[1],
  ) {
    try {
      return await this.oidc.verify(idToken, opts);
    } catch (err) {
      if (err instanceof OidcVerificationError) {
        throw new UnauthorizedException('Could not verify that sign-in.');
      }
      throw err;
    }
  }

  /**
   * Mint our session for a resolved user.
   *
   * Goes through `AuthService.issueSession` rather than signing tokens here, so
   * these routes inherit the deactivated-recruiter check that lives inside it —
   * the gap that once let a removed recruiter regain a session through a path
   * that bypassed login.
   */
  private async issueFor(user: Parameters<AuthService['issueSession']>[0], req: Request) {
    const result = await this.auth.issueSession(
      user,
      req.headers['user-agent'] ? String(req.headers['user-agent']) : undefined,
      req.ip,
    );
    return { user, accessToken: result.accessToken, refreshToken: result.refreshToken };
  }

}
