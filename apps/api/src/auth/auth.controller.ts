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
  Post,
  Req,
  Res,
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
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { PasswordResetService } from './password-reset.service';
import { ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from './dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { PerEmailThrottleGuard } from './per-email-throttle.guard';

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
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: unknown) {
    const parsed = RegisterDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const { userId } = await this.auth.register(parsed.data);
    await this.emailVerify.issueAndSend(userId, parsed.data.email);
    return { ok: true };
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
    await this.emailVerify.issueAndSend(user.sub, user.email);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AccessClaims) {
    return this.auth.me(user.sub);
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
