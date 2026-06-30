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
import { CurrentUser, Roles } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ListNotificationsQueryDto, UpdateRecruiterNotificationPreferencesDto } from './dto';
import { RecruiterNotificationsService } from './recruiter-notifications.service';

// Recruiter notification bell. Reads (list + unread-count) happen here for the
// client poll; the recruiter shell server-renders the initial count directly via
// Prisma (reads/writes split). RolesGuard + @Roles('RECRUITER') is the trusted
// (L3) boundary; the killswitch L3 gate on mutations lives in the service.
@Controller('recruiter/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RECRUITER')
export class RecruiterNotificationsController {
  constructor(private readonly service: RecruiterNotificationsService) {}

  @Get()
  list(@CurrentUser() user: AccessClaims, @Query() query: unknown) {
    const parsed = ListNotificationsQueryDto.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.list(user.sub, parsed.data);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AccessClaims) {
    return this.service.unreadCount(user.sub);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: AccessClaims, @Param('id', ParseIntPipe) id: number) {
    return this.service.markRead(user.sub, id);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: AccessClaims) {
    return this.service.markAllRead(user.sub);
  }
}

// Recruiter notification channel preferences (email on/off, SMS on/off).
// Recruiter-scoped store, separate from the candidate-shared /me/notifications.
@Controller('recruiter/notification-preferences')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RECRUITER')
export class RecruiterNotificationPreferencesController {
  constructor(private readonly service: RecruiterNotificationsService) {}

  @Get()
  get(@CurrentUser() user: AccessClaims) {
    return this.service.getPreferences(user.sub);
  }

  @Patch()
  async update(@CurrentUser() user: AccessClaims, @Body() body: unknown) {
    const parsed = UpdateRecruiterNotificationPreferencesDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.updatePreferences(user.sub, parsed.data);
  }
}
