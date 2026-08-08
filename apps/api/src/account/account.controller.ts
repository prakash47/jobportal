import { Body, Controller, Delete, HttpCode, HttpStatus, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { BadRequestException } from '@nestjs/common';
import { clearAuthCookies, cookieEnvFromProcess, type AccessClaims } from '@jobportal/auth';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccountService } from './account.service';
import { DeleteAccountDto } from './dto';

@Controller({ path: 'me/account', version: '1' })
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(private readonly service: AccountService) {}

  /**
   * Permanently delete the caller's account (ADR 0002 decision 8).
   *
   * Versioned at `/v1` because it is new and mobile-facing; nothing on the web
   * called it before, so there is no path to preserve.
   *
   * DELETE with a body is unusual but correct here: the confirmation phrase is
   * a deliberate friction step, not a resource identifier, and putting it in the
   * query string would write "DELETE" into access logs and browser history
   * alongside the account it destroyed. Express and Nest both parse it fine.
   *
   * The cookies are cleared on the way out. The Session rows are already gone
   * with the cascade, so the refresh token is dead either way — but leaving the
   * browser holding credentials for an account that no longer exists produces a
   * confusing 401 loop on the next page rather than a clean signed-out state.
   */
  @Delete()
  @HttpCode(HttpStatus.OK)
  async deleteAccount(
    @CurrentUser() user: AccessClaims,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = DeleteAccountDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);

    const result = await this.service.deleteOwnAccount(user.sub);
    clearAuthCookies(res, cookieEnvFromProcess());
    return result;
  }
}
