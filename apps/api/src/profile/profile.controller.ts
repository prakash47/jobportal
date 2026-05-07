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
import { ProfilePatchDto } from './dto';
import { ProfileService, type ProfileView } from './profile.service';

@Controller('me/profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly service: ProfileService) {}

  @Get()
  get(@CurrentUser() user: AccessClaims): Promise<ProfileView> {
    return this.service.getProfile(user.sub);
  }

  @Patch()
  async patch(
    @CurrentUser() user: AccessClaims,
    @Body() body: unknown,
  ): Promise<ProfileView> {
    const parsed = ProfilePatchDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.updateProfile(user.sub, parsed.data);
  }
}
