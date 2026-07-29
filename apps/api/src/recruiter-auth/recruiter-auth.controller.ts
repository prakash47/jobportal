import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { cookieEnvFromProcess, setAuthCookies, type AccessClaims } from '@jobportal/auth';
import { CurrentUser, Roles } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ChangePasswordDto, RegisterRecruiterDto, RequestOtpDto, VerifyOtpDto } from './dto';
import { RecruiterOtpService } from './recruiter-otp.service';
import { RecruiterPasswordService } from './recruiter-password.service';
import { RecruiterRegistrationService } from './recruiter-registration.service';
import { RecruiterWorkEmailService } from './recruiter-work-email.service';

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

@Controller('auth/recruiter')
export class RecruiterAuthController {
  constructor(
    private readonly registration: RecruiterRegistrationService,
    private readonly workEmail: RecruiterWorkEmailService,
    private readonly password: RecruiterPasswordService,
    private readonly otp: RecruiterOtpService,
  ) {}

  // SRS §4.9.1 — request (or resend) a signup one-time code. Unauthenticated:
  // it runs before any account exists. 5/min/IP — one signup needs two codes,
  // so this allows a couple of genuine retries per minute and nothing like a
  // resend flood. 202, not 201: the code is issued here but its DELIVERY is
  // out-of-band (a staff member relays it off /sadmin/otp-sessions), so the
  // response acknowledges the request rather than claiming the code arrived.
  @Post('otp/request')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  async requestOtp(@Body() body: unknown, @Req() req: Request) {
    const parsed = RequestOtpDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.otp.request(parsed.data, req.ip);
  }

  // SRS §4.9.1 — check a typed code. Unauthenticated for the same reason.
  // 10/min/IP rather than 5: a registrant types two codes and mistypes some of
  // them. A per-IP budget is not the brute-force bound in any case — an
  // attacker adds IPs. The bound is in RecruiterOtpService: the 5-attempt cap
  // makes one issued code expensive, and OTP_MAX_LIVE_PER_DESTINATION caps how
  // many codes one address can have in flight, which is the part a caller
  // cannot reset by minting a fresh signupId.
  @Post('otp/verify')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() body: unknown) {
    const parsed = VerifyOtpDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.otp.verify(parsed.data);
  }

  // SRS §4.9.1 — register + auto-login. Same throttle policy as the
  // candidate /auth/register (10/min/IP) — registrations are rare and a
  // higher cap invites abuse.
  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = RegisterRecruiterDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);

    const result = await this.registration.register(
      parsed.data,
      req.headers['user-agent'] ? String(req.headers['user-agent']) : undefined,
      req.ip,
    );
    setAuthCookies(res, result.accessToken, result.refreshToken, cookieEnvFromProcess());
    return {
      user: publicUser(result.user),
      recruiterId: result.recruiterId,
      workEmailVerified: result.workEmailVerified,
    };
  }

  // SRS §4.9.2 — work-email verification. Public (the token IS the
  // capability), idempotent. GET is fine here because verification is a
  // positive + repeatable action — pre-fetcher firing the URL just verifies
  // sooner.
  @Get('verify-work-email')
  async verifyWorkEmail(@Query('token') token: string | undefined) {
    if (!token) throw new BadRequestException('Missing token');
    const { recruiterId } = await this.workEmail.verify(token);
    return { verified: true, recruiterId };
  }

  // Recruiter self-service password change (Settings → Change Password).
  // Authenticated (L3: JwtAuthGuard + RolesGuard('RECRUITER')) — the trusted
  // enforcement boundary. Stricter throttle than login (5/min/IP): a password
  // change is rare and this caps online-guessing of the current password.
  // Returns 204 and rotates the auth cookies to a fresh session (all prior
  // sessions, including this one, were revoked server-side; the recruiter stays
  // signed in on THIS device and is logged out everywhere else).
  @Post('change-password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: AccessClaims,
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = ChangePasswordDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);

    const result = await this.password.changePassword(
      user.sub,
      parsed.data,
      req.headers['user-agent'] ? String(req.headers['user-agent']) : undefined,
      req.ip,
    );
    setAuthCookies(res, result.accessToken, result.refreshToken, cookieEnvFromProcess());
  }
}
