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
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { cookieEnvFromProcess, setAuthCookies, type AccessClaims } from '@jobportal/auth';
import type { User } from '@jobportal/db';
import { CurrentUser, Roles } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AcceptInviteDto, InviteUserDto, UpdateUserDto } from './dto';
import { RecruiterUsersService } from './recruiter-users.service';

function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: user.emailVerified,
  };
}

// Team mutations are sensitive but not one-per-minute rare; 20/min/IP caps abuse
// without getting in the way of an admin setting up their team.
const MUTATION_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

@Controller('recruiter/users')
export class RecruiterUsersController {
  constructor(private readonly users: RecruiterUsersService) {}

  // --- Authenticated team management (L3 trusted boundary) -----------------

  @Post('invite')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  @Throttle(MUTATION_THROTTLE)
  @HttpCode(HttpStatus.CREATED)
  async invite(@CurrentUser() user: AccessClaims, @Body() body: unknown) {
    const parsed = InviteUserDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.users.invite(user.sub, parsed.data);
  }

  @Post('invites/:id/revoke')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  @Throttle(MUTATION_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@CurrentUser() user: AccessClaims, @Param('id', ParseIntPipe) id: number) {
    await this.users.revokeInvite(user.sub, id);
  }

  @Patch(':recruiterId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  @Throttle(MUTATION_THROTTLE)
  async update(
    @CurrentUser() user: AccessClaims,
    @Param('recruiterId', ParseIntPipe) recruiterId: number,
    @Body() body: unknown,
  ) {
    const parsed = UpdateUserDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.users.updateUser(user.sub, recruiterId, parsed.data);
  }

  @Delete(':recruiterId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  @Throttle(MUTATION_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AccessClaims,
    @Param('recruiterId', ParseIntPipe) recruiterId: number,
  ) {
    await this.users.removeUser(user.sub, recruiterId);
  }

  // --- Public invite endpoints (the token IS the capability) ---------------

  // GET preview is safe/idempotent (read-only, returns no token) so the public
  // accept page can render the company + role before the invitee commits.
  @Get('invite/:token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async preview(@Param('token') token: string) {
    return this.users.previewInvite(token);
  }

  // POST accept — it mutates (creates the account + joins the company), so it is
  // never a GET: an email scanner / link prefetcher must not consume the invite.
  @Post('accept-invite')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  async accept(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = AcceptInviteDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const result = await this.users.acceptInvite(
      parsed.data,
      req.headers['user-agent'] ? String(req.headers['user-agent']) : undefined,
      req.ip,
    );
    setAuthCookies(res, result.accessToken, result.refreshToken, cookieEnvFromProcess());
    return { user: publicUser(result.user), recruiterId: result.recruiterId };
  }
}
