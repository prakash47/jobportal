import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AccessClaims } from '@jobportal/auth';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequireAdminScope } from '../auth/admin-scope.decorator';
import { AdminGuard } from '../feature-flags/admin.guard';
import { ParseInt32IdPipe } from '../common/parse-int32-id.pipe';
import { AdminSupportService } from './admin-support.service';
import {
  AddNoteDto,
  ListContactMessagesQueryDto,
  ListTicketsQueryDto,
  StaffReplyDto,
  UpdateTicketStatusDto,
} from './dto';

// Admin Help & Support console. AdminGuard verifies the JWT and enforces
// role === 'ADMIN' (assigned only by direct DB write per §9) — the
// non-bypassable boundary. Deliberately NOT gated by the recruiter
// killswitch.recruiter_help_support: staff can keep working existing tickets
// while the recruiter-facing surface is paused.
@Controller('admin/support')
@UseGuards(AdminGuard)
@RequireAdminScope('support', 'READ_ONLY')
export class AdminSupportController {
  constructor(private readonly service: AdminSupportService) {}

  @Get('tickets')
  async listTickets(@Query() query: unknown) {
    const parsed = ListTicketsQueryDto.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.listTickets(parsed.data);
  }

  // ParseInt32IdPipe, not Nest's ParseIntPipe, on every :id below. ParseIntPipe
  // accepts any JS-safe integer, so `2147483648` reaches Prisma, overflows
  // Postgres int4 and surfaces as a 500 — a bug this repo has now shipped three
  // times (job-postings, billing, reports) and fixed with this pipe twice. A
  // nonexistent ticket must 404, and an unrepresentable id must 400; neither is
  // a server error.
  @Get('tickets/:id')
  detail(@Param('id', ParseInt32IdPipe) id: number) {
    return this.service.getTicketDetail(id);
  }

  @RequireAdminScope('support', 'EDIT')
  @Patch('tickets/:id')
  async updateStatus(
    @CurrentUser() admin: AccessClaims,
    @Param('id', ParseInt32IdPipe) id: number,
    @Body() body: unknown,
  ) {
    const parsed = UpdateTicketStatusDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.updateStatus(admin.sub, id, parsed.data);
  }

  @RequireAdminScope('support', 'EDIT')
  @Post('tickets/:id/messages')
  async reply(
    @CurrentUser() admin: AccessClaims,
    @Param('id', ParseInt32IdPipe) id: number,
    @Body() body: unknown,
  ) {
    const parsed = StaffReplyDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.staffReply(admin.sub, id, parsed.data);
  }

  // Internal notes: staff-only text, never shown to the raiser and never
  // notified. There is deliberately no GET — notes come back on the ticket
  // detail above, which keeps them behind exactly one AdminGuard'd read rather
  // than adding a second surface that could later be exposed on its own.
  //
  // There is also no PATCH and no DELETE. A note is a contemporaneous record of
  // what staff knew and when; making it editable would let the account that
  // wrote it rewrite its own trail after the fact, and the audit row only
  // attests that a note was added.
  @RequireAdminScope('support', 'EDIT')
  @Post('tickets/:id/notes')
  async addNote(
    @CurrentUser() admin: AccessClaims,
    @Param('id', ParseInt32IdPipe) id: number,
    @Body() body: unknown,
  ) {
    const parsed = AddNoteDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.addNote(admin.sub, id, parsed.data);
  }

  @Get('contact-messages')
  async listContactMessages(@Query() query: unknown) {
    const parsed = ListContactMessagesQueryDto.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.listContactMessages(parsed.data);
  }
}
