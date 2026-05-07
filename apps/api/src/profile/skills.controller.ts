import {
  BadRequestException,
  Body,
  Controller,
  Patch,
  UseGuards,
} from '@nestjs/common';
import type { AccessClaims } from '@jobportal/auth';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SkillsUpdateDto } from './dto';
import { ProfileSkillsService } from './skills.service';

@Controller('me/skills')
@UseGuards(JwtAuthGuard)
export class ProfileSkillsController {
  constructor(private readonly service: ProfileSkillsService) {}

  @Patch()
  async update(@CurrentUser() user: AccessClaims, @Body() body: unknown) {
    const parsed = SkillsUpdateDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.update(user.sub, parsed.data.skillIds);
  }
}
