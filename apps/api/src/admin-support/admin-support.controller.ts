import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AccessClaims } from '@jobportal/auth';
import { CurrentUser } from '../auth/current-user.decorator';
import { AdminGuard } from '../feature-flags/admin.guard';
import { AdminSupportService } from './admin-support.service';
import {
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
export class AdminSupportController {
  constructor(private readonly service: AdminSupportService) {}

  @Get('tickets')
  async listTickets(@Query() query: unknown) {
    const parsed = ListTicketsQueryDto.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.listTickets(parsed.data);
  }

  @Get('tickets/:id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.getTicketDetail(id);
  }

  @Patch('tickets/:id')
  async updateStatus(
    @CurrentUser() admin: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    const parsed = UpdateTicketStatusDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.updateStatus(admin.sub, id, parsed.data);
  }

  @Post('tickets/:id/messages')
  async reply(
    @CurrentUser() admin: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    const parsed = StaffReplyDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.staffReply(admin.sub, id, parsed.data);
  }

  @Get('contact-messages')
  async listContactMessages(@Query() query: unknown) {
    const parsed = ListContactMessagesQueryDto.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.listContactMessages(parsed.data);
  }
}
