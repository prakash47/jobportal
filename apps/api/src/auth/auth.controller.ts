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
import { SignupOtpService } from './signup-otp.service';
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterWithOtpDto,
  RequestSignupOtpDto,
  ResetPasswordDto,
  UpdateNameDto,
  VerifyResetOtpDto,
  VerifySignupOtpDto,
} from './dto';
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
    private readonly signupOtp: SignupOtpService,
  ) {}

  // ---- Seeker signup email verification (SRS §4.12) -----------------------
  //
  // Registration accepted any syntactically-valid address, so `x@gmail.con`
  // created a real account and reported success. No validator can catch that —
  // whether a mailbox exists is not derivable from the text — so the address is
  // proven by sending a code to it. NOTHING is created until it comes back.
  //
  // Both routes are unauthenticated by necessity (there is no account yet) and
  // carry the same per-IP throttles the recruiter equivalents use. The per-IP
  // budget is NOT the brute-force bound — an attacker adds IPs — that lives in
  // SignupOtpService: a 5-attempt cap per code, and a live-codes-per-address
  // ceiling a caller cannot reset by minting a fresh signupId.

  @Post('signup/otp/request')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  async requestSignupOtp(@Body() body: unknown, @Req() req: Request) {
    const parsed = RequestSignupOtpDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.signupOtp.request(parsed.data, req.ip);
  }

  // 10/min rather than 5: a registrant mistypes a six-digit code more often
  // than they request one.
  @Post('signup/otp/verify')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async verifySignupOtp(@Body() body: unknown) {
    const parsed = VerifySignupOtpDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.signupOtp.verify(parsed.data);
  }

  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // RegisterWithOtpDto, not RegisterDto: the website must present a verified
    // signup handle. The mobile controller still parses the plain RegisterDto,
    // which is what keeps the app working unchanged (see the WORKLOG Notice).
    const parsed = RegisterWithOtpDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);

    // Bound to the address being registered, not merely to a verified handle.
    // Without re-checking the destination a caller could verify their own
    // address and then submit somebody else's — the same bug one layer down.
    await this.signupOtp.assertVerifiedEmail(parsed.data.signupId, parsed.data.email);

    const result = await this.auth.register(
      parsed.data,
      req.headers['user-agent'] ? String(req.headers['user-agent']) : undefined,
      req.ip,
      {
        signupId: parsed.data.signupId,
        consume: (tx, signupId) => this.signupOtp.consumeVerified(tx, signupId),
      },
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
    // NO verification link is sent here any more. The account was created with
    // emailVerified: true because a code sent to this address came back, so a
    // second "please confirm your email" message would ask the user to re-prove
    // something they just proved — and would arrive for an address that is by
    // construction already reachable. `emailVerify.issueAndSend` still serves
    // the resend endpoint and the mobile route, which has no OTP step yet.
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

  // Step 1 — issue a 6-digit reset code (SRS §4.12.5).
  //
  // Answers 200 with the code's expiry and the next resend time so the form can
  // run its countdown off a server clock. Those timings are returned for EVERY
  // caller, including unknown addresses and OAuth-only accounts — the service
  // synthesises them rather than revealing that nothing was sent, which is what
  // keeps this from being an account-existence oracle.
  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() body: unknown, @Req() req: Request) {
    await assertEmailsEnabled();
    const parsed = ForgotPasswordDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.passwordReset.requestCode(parsed.data.email, req.ip);
  }

  // Step 2 — verify the code, returning the one-time ticket step 3 spends.
  //
  // Deliberately NOT behind assertEmailsEnabled: nothing is sent here, and
  // flipping the email killswitch mid-flow must not strand somebody who is
  // already holding a valid code.
  @Post('verify-reset-otp')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async verifyResetOtp(@Body() body: unknown) {
    const parsed = VerifyResetOtpDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.passwordReset.verifyCode(parsed.data.email, parsed.data.code);
  }

  // Step 3 — spend the ticket, set the password, and sign the user in.
  //
  // The reset ends authenticated: the caller has just proven control of the
  // mailbox AND chosen the new password, so making them retype it at a login
  // form adds friction without adding proof. Every OTHER session was revoked
  // inside the same transaction that set the password, so the cookies minted
  // here are the only ones left alive.
  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = ResetPasswordDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const user = await this.passwordReset.resetWithTicket(parsed.data.ticket, parsed.data.password);
    const session = await this.auth.issueSession(
      user,
      req.headers['user-agent'] ? String(req.headers['user-agent']) : undefined,
      req.ip,
    );
    setAuthCookies(res, session.accessToken, session.refreshToken, cookieEnvFromProcess());
    return { user: publicUser(user) };
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
