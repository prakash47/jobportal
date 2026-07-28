import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  type AccessClaims,
  clearAuthCookies,
  cookieEnvFromProcess,
  readRefreshTokenCookie,
  setAuthCookies,
} from '@jobportal/auth';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { PasswordResetService } from './password-reset.service';
import { ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto, UpdateNameDto } from './dto';
import { EmailService } from '../email/email.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { PerEmailThrottleGuard } from './per-email-throttle.guard';

const KILLSWITCH_FLAG = 'killswitch.transactional_emails';

// Layer 2 of the killswitch.transactional_emails three-layer enforcement.
// L3 (the worker no-op) is the trust boundary, but rejecting the resend
// endpoints up front gives the UI a real signal — without this, the user
// sees a "we sent you an email" success page and then never gets the email.
async function assertEmailsEnabled(): Promise<void> {
  if (await isFlagEnabled(KILLSWITCH_FLAG)) {
    throw new ServiceUnavailableException(
      'Email is temporarily unavailable. Please try again shortly.',
    );
  }
}

function publicUser(user: { id: number; email: string; name: string; role: string; emailVerified: boolean }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: user.emailVerified,
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly emailVerify: EmailVerificationService,
    private readonly passwordReset: PasswordResetService,
    private readonly email: EmailService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = RegisterDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const result = await this.auth.register(
      parsed.data,
      req.headers['user-agent'] ? String(req.headers['user-agent']) : undefined,
      req.ip,
    );
    // Auto-login: set the session cookies so the new seeker lands authenticated
    // on the onboarding step (no separate sign-in).
    setAuthCookies(res, result.accessToken, result.refreshToken, cookieEnvFromProcess());
    // SRS §4.13 — registration confirmation + email-verification fire as
    // separate templates so the welcome message is not coupled to the
    // verification token TTL. Don't gate on killswitch here: an emergency
    // killswitch should not silently break account creation; the worker's
    // L3 no-op is sufficient and a reasonable failure mode (user signs up,
    // emails are deferred until killswitch lifts).
    // Belt-and-suspenders: the account + session + cookies are already committed
    // above, so an email failure must NEVER 500 the request and strand a
    // created-but-"failed" account. Swallow it — the user can request a fresh
    // verification email later. (enqueue() also log-and-drops on a down queue;
    // this also covers any failure in token creation.)
    try {
      await this.emailVerify.issueAndSend(result.user.id, parsed.data.email);
    } catch {
      // No logger injected in the controller; the email/queue layers log.
    }
    // Fire-and-log: enqueue is fast, but a Redis blip should not flip a
    // successful registration into a 5xx. The verify email above IS awaited
    // because the user can't apply without it; this welcome email is
    // strictly cosmetic.
    this.email
      .enqueueRegistrationConfirmation(parsed.data.email, result.user.id, {
        name: parsed.data.name,
      })
      .catch(() => {
        // Logger isn't injected into the controller; the queue-level
        // logging in TransactionalEmailQueueService already covers offline
        // cases. Other failures (Redis ack timeout) are rare enough that
        // swallowing here is acceptable for a welcome email.
      });
    return { user: publicUser(result.user) };
  }

  @Post('login')
  @UseGuards(PerEmailThrottleGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = LoginDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);

    const result = await this.auth.login(
      parsed.data,
      req.headers['user-agent'] ? String(req.headers['user-agent']) : undefined,
      req.ip,
    );
    setAuthCookies(res, result.accessToken, result.refreshToken, cookieEnvFromProcess());
    return { user: publicUser(result.user) };
  }

  // Sign-in for the internal Super Admin portal (apps/sadmin). Separate from
  // /auth/login because that endpoint is deliberately role-agnostic: it will
  // happily issue cookies to a CANDIDATE who posts to the admin sign-in form.
  // Mounted under /auth/* like every other session route, so the refresh cookie
  // (path=/auth) stays reachable if refresh is ever wired up.
  //
  // Same guards and rate limits as /auth/login — PerEmailThrottleGuard is not
  // global and must be listed explicitly, or this becomes the one unthrottled
  // password endpoint in the app, on the highest-privilege account class.
  @Post('admin/login')
  @UseGuards(PerEmailThrottleGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async adminLogin(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = LoginDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);

    const result = await this.auth.adminLogin(
      parsed.data,
      req.headers['user-agent'] ? String(req.headers['user-agent']) : undefined,
      req.ip,
    );
    setAuthCookies(res, result.accessToken, result.refreshToken, cookieEnvFromProcess());
    return { user: publicUser(result.user) };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = readRefreshTokenCookie(req);
    if (!refreshToken) throw new UnauthorizedException('No refresh token');
    const result = await this.auth.refresh(
      refreshToken,
      req.headers['user-agent'] ? String(req.headers['user-agent']) : undefined,
      req.ip,
    );
    setAuthCookies(res, result.accessToken, result.refreshToken, cookieEnvFromProcess());
    return { user: publicUser(result.user) };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = readRefreshTokenCookie(req);
    if (refreshToken) await this.auth.logout(refreshToken);
    clearAuthCookies(res, cookieEnvFromProcess());
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgotPassword(@Body() body: unknown) {
    await assertEmailsEnabled();
    const parsed = ForgotPasswordDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    await this.passwordReset.issueAndSend(parsed.data.email);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(@Body() body: unknown) {
    const parsed = ResetPasswordDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    await this.passwordReset.reset(parsed.data.token, parsed.data.password);
  }

  @Get('verify-email')
  async verifyEmail(@Req() req: Request) {
    const token = String(req.query.token ?? '');
    if (!token) throw new BadRequestException('Missing token');
    const userId = await this.emailVerify.verify(token);
    return { ok: true, userId };
  }

  @Post('resend-verification')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 1, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  async resendVerification(@CurrentUser() user: AccessClaims) {
    await assertEmailsEnabled();
    await this.emailVerify.issueAndSend(user.sub, user.email);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AccessClaims) {
    return this.auth.me(user.sub);
  }

  // Update the signed-in user's display name (onboarding name edit). Email is
  // intentionally not updatable here.
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateMe(@CurrentUser() user: AccessClaims, @Body() body: unknown) {
    const parsed = UpdateNameDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.auth.updateName(user.sub, parsed.data.name);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.auth.revokeSession(user.sub, id);
  }
}
