import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AccessClaims } from '@jobportal/auth';
import { CurrentUser, Roles } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ContactMessageDto, CreateTicketDto, ReplyTicketDto } from './dto';
import { RecruiterSupportService } from './recruiter-support.service';

// Recruiter Help & Support — mutations only. The FAQ is static in-app content;
// the "my tickets" list + a ticket thread are read in the recruiter RSCs
// directly via Prisma (reads/writes split). This controller owns the writes:
// raising a ticket, replying, closing, and the Contact Us submission. All are
// L3-gated: JwtAuthGuard + RolesGuard('RECRUITER'), and the service asserts the
// killswitch (503 when ON) + scopes every ticket to the JWT subject.
const TICKET_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

@Controller('recruiter/support')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RECRUITER')
export class RecruiterSupportController {
  constructor(private readonly support: RecruiterSupportService) {}

  @Post('tickets')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  async createTicket(@CurrentUser() user: AccessClaims, @Body() body: unknown) {
    const parsed = CreateTicketDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.support.createTicket(user.sub, parsed.data);
  }

  @Post('tickets/:id/messages')
  @Throttle(TICKET_THROTTLE)
  @HttpCode(HttpStatus.CREATED)
  async reply(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    const parsed = ReplyTicketDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.support.reply(user.sub, id, parsed.data);
  }

  @Post('tickets/:id/close')
  @Throttle(TICKET_THROTTLE)
  @HttpCode(HttpStatus.OK)
  async close(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.support.close(user.sub, id);
  }

  @Post('contact')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  async contact(@CurrentUser() user: AccessClaims, @Body() body: unknown) {
    const parsed = ContactMessageDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.support.submitContact(user.sub, parsed.data);
  }
}
