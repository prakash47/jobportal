import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AccessClaims } from '@jobportal/auth';
import { CurrentUser } from '../auth/current-user.decorator';
import { AdminGuard } from '../feature-flags/admin.guard';
import { ParseInt32IdPipe } from '../common/parse-int32-id.pipe';
import { AdminBroadcastsService } from './admin-broadcasts.service';
import {
  CreateBroadcastDto,
  ListBroadcastsQueryDto,
  PreviewCountDto,
  UpdateBroadcastDto,
} from './dto';

/**
 * Admin Broadcast Notifications console (/sadmin/broadcasts).
 *
 * AdminGuard verifies the JWT and enforces `role === 'ADMIN'` (assigned only by
 * direct DB write per CLAUDE.md §9) — the non-bypassable boundary. No @Roles
 * decorator: RolesGuard in this app is recruiter-only, and no admin controller
 * uses it.
 *
 * No `/v1` prefix. main.ts sets `defaultVersion: VERSION_NEUTRAL`, so adding a
 * version here would 404 the sadmin console.
 *
 * ⚠ Unlike /reports, /job-postings and /subscriptions — which read Postgres
 * directly from the sadmin RSC — the reads here go through this controller. The
 * reason is the one lib/support/types.ts records: this module has real
 * lifecycle rules (segment resolution, the DRAFT→SENDING transition, the
 * test-send precondition, cancellation) that the write path depends on, and a
 * second where-clause in the console would fork away from the one the send
 * actually uses. The count an admin approves has to be produced by the same code
 * that decides who gets the message.
 */
@Controller('admin/broadcasts')
@UseGuards(AdminGuard)
export class AdminBroadcastsController {
  constructor(private readonly service: AdminBroadcastsService) {}

  @Get()
  async list(@Query() query: unknown) {
    const parsed = ListBroadcastsQueryDto.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.list(parsed.data);
  }

  /**
   * How many people a segment resolves to right now.
   *
   * A POST rather than a GET despite being a read, because it is the composer's
   * live preview and its input is the same body shape the compose form already
   * holds. It writes nothing.
   */
  @Post('preview-count')
  async previewCount(@Body() body: unknown) {
    const parsed = PreviewCountDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.previewCount(parsed.data);
  }

  @Post()
  async create(@CurrentUser() admin: AccessClaims, @Body() body: unknown) {
    const parsed = CreateBroadcastDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(admin.sub, parsed.data);
  }

  // ParseInt32IdPipe, not Nest's ParseIntPipe, on every :id below. ParseIntPipe
  // accepts any JS-safe integer, so `2147483648` reaches Prisma, overflows
  // Postgres int4 and surfaces as a 500 — a bug this repo has shipped four times
  // now. An unrepresentable id must 400; a nonexistent one must 404. Neither is
  // a server error.
  @Get(':id')
  detail(@Param('id', ParseInt32IdPipe) id: number) {
    return this.service.getDetail(id);
  }

  @Put(':id')
  async update(@Param('id', ParseInt32IdPipe) id: number, @Body() body: unknown) {
    const parsed = UpdateBroadcastDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.update(id, parsed.data);
  }

  /**
   * Send a copy to the acting admin's own address.
   *
   * Throttled harder than the global 100/min because it is the one endpoint here
   * that puts real mail on the wire without a preceding state check, and a loop
   * against it is free outbound volume on our sending domain.
   */
  @Post(':id/test-send')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  testSend(@CurrentUser() admin: AccessClaims, @Param('id', ParseInt32IdPipe) id: number) {
    return this.service.testSend(admin.sub, id);
  }

  /**
   * Dispatch. The irreversible one.
   *
   * ⚠ This carries the tightest rate limit in the admin surface, and it is not
   * ceremony. Every other admin killswitch guards an action whose damage is
   * bounded by one row; this one puts a message in front of every recruiter or
   * every candidate on the platform, and an email that has left cannot be
   * recalled. The global ThrottlerGuard's 100/min would allow a hundred
   * platform-wide sends a minute from a stolen admin cookie.
   *
   * The state machine already makes a double-submit a 409 (a broadcast leaves
   * DRAFT on the first call), so this limit is about many DIFFERENT broadcasts
   * in quick succession — which is not a thing a human does deliberately.
   */
  @Post(':id/send')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  send(@CurrentUser() admin: AccessClaims, @Param('id', ParseInt32IdPipe) id: number) {
    return this.service.send(admin.sub, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() admin: AccessClaims, @Param('id', ParseInt32IdPipe) id: number) {
    return this.service.cancel(admin.sub, id);
  }
}
