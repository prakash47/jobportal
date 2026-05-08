import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import type { AccessClaims } from '@jobportal/auth';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateNotificationPreferencesDto } from './dto';
import { NotificationsPreferencesService } from './notifications-preferences.service';

// SRS §4.13.4 — read + update the current user's email-channel toggles.
// Auth-gated; no cross-user access path. Both candidates and recruiters
// share these toggles (they're attributes of User, not role-scoped).
@Controller('me/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsPreferencesController {
  constructor(private readonly service: NotificationsPreferencesService) {}

  @Get()
  read(@CurrentUser() user: AccessClaims) {
    return this.service.read(user.sub);
  }

  @Patch()
  async update(@CurrentUser() user: AccessClaims, @Body() body: unknown) {
    const parsed = UpdateNotificationPreferencesDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.update(user.sub, parsed.data);
  }
}
