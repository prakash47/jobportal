import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { cookieEnvFromProcess, setAuthCookies, type AccessClaims } from '@jobportal/auth';
import type { User } from '@jobportal/db';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequireAdminScope } from '../auth/admin-scope.decorator';
import { AdminGuard } from '../feature-flags/admin.guard';
import { ParseInt32IdPipe } from '../common/parse-int32-id.pipe';
import { AcceptStaffInviteDto, InviteStaffDto, UpdateStaffDto } from './dto';
import { AdminStaffService } from './admin-staff.service';

function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: user.emailVerified,
  };
}

// Staff provisioning is rare and high-consequence; 20/min/IP matches the
// recruiter team mutations and is far above any legitimate rate here.
const MUTATION_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

/**
 * Roles & Permissions console (/sadmin/roles) — SRS §4.16, ADR 0007.
 *
 * The write half of PR B. There are deliberately no list/detail endpoints: the
 * console reads AdminStaff directly from its RSC per this repo's reads/writes
 * split, gated at Layer 2 by requireAdminScope('system', 'EDIT') and policed by
 * lib/roles/scope-map.test.ts.
 *
 * No `/v1` prefix — main.ts sets defaultVersion: VERSION_NEUTRAL, so a version
 * here would 404 the console.
 */
// system/EDIT as the controller-level scope. `system` covers feature flags AND
// staff management because they are one privilege wearing two hats: flag write
// disables the killswitches gating every other module, and staff edit grants any
// module directly. clampSystem() makes it non-overridable, so this annotation is
// exactly "SUPER_ADMIN only" and no stored permissions blob can widen it.
//
// It is declared explicitly even though an un-annotated route would default to
// the same requirement, so the intent is visible in review rather than inherited
// from a fallback. AdminGuard reads it with getAllAndOverride([handler, class]),
// so a class-level declaration reaches every handler that runs the guard.
//
// ⚠ AdminGuard is attached PER METHOD, not on the controller, and that is load
// bearing rather than stylistic. Nest MERGES controller-level and method-level
// guards — it does not let a handler opt out — so a class-level
// @UseGuards(AdminGuard) would also run on the two public invite endpoints, and
// a method-level `@UseGuards()` would NOT clear it. An invitee has no session by
// definition, so the guard would make the invitation impossible to accept. Same
// shape as recruiter-users.controller.ts, for the same reason.
@Controller('admin/staff')
@RequireAdminScope('system', 'EDIT')
export class AdminStaffController {
  constructor(private readonly staff: AdminStaffService) {}

  // --- Authenticated staff management --------------------------------------

  @Post('invite')
  @UseGuards(AdminGuard)
  @Throttle(MUTATION_THROTTLE)
  @HttpCode(HttpStatus.CREATED)
  async invite(@CurrentUser() user: AccessClaims, @Body() body: unknown) {
    const parsed = InviteStaffDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.staff.invite(user.sub, parsed.data);
  }

  @Post('invites/:id/resend')
  @UseGuards(AdminGuard)
  @Throttle(MUTATION_THROTTLE)
  @HttpCode(HttpStatus.CREATED)
  async resendInvite(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseInt32IdPipe) id: number,
  ) {
    return this.staff.resendInvite(user.sub, id);
  }

  @Post('invites/:id/revoke')
  @UseGuards(AdminGuard)
  @Throttle(MUTATION_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeInvite(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseInt32IdPipe) id: number,
  ) {
    await this.staff.revokeInvite(user.sub, id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  @Throttle(MUTATION_THROTTLE)
  async update(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseInt32IdPipe) id: number,
    @Body() body: unknown,
  ) {
    const parsed = UpdateStaffDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.staff.updateStaff(user.sub, id, parsed.data);
  }

  // POST rather than DELETE: nothing is deleted. The row is kept so the audit
  // trail hanging off that User survives (ProfileAuditLog.user cascades).
  @Post(':id/deactivate')
  @UseGuards(AdminGuard)
  @Throttle(MUTATION_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivate(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseInt32IdPipe) id: number,
  ) {
    await this.staff.deactivateStaff(user.sub, id);
  }

  @Post(':id/reactivate')
  @UseGuards(AdminGuard)
  @Throttle(MUTATION_THROTTLE)
  async reactivate(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseInt32IdPipe) id: number,
  ) {
    return this.staff.reactivateStaff(user.sub, id);
  }

  // --- Public invite endpoints (the token IS the capability) ---------------
  //
  // These two carry NO @UseGuards, which in this app is the entire mechanism for
  // "public": there is no @Public() decorator and no IS_PUBLIC key anywhere in
  // apps/api, and the only global guard is the throttler. A handler is public by
  // omission — which also means a copy-paste that keeps the guard silently makes
  // the invitation un-acceptable, with no error to notice.
  //
  // Tighter throttles than the authed routes because they are unauthenticated
  // and token-guessable: 30/min for the read, 10/min for the mutation.

  @Get('invite/:token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async preview(@Param('token') token: string) {
    return this.staff.previewInvite(token);
  }

  @Post('accept-invite')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  async accept(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = AcceptStaffInviteDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const result = await this.staff.acceptInvite(
      parsed.data,
      req.headers['user-agent'] ? String(req.headers['user-agent']) : undefined,
      req.ip,
    );
    setAuthCookies(res, result.accessToken, result.refreshToken, cookieEnvFromProcess());
    return { user: publicUser(result.user), staffId: result.staffId };
  }
}
