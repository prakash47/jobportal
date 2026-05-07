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
  UseGuards,
} from '@nestjs/common';
import type { AccessClaims } from '@jobportal/auth';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ExperienceCreateDto, ExperienceUpdateDto } from './dto';
import { ExperienceService } from './experience.service';

@Controller('me/experience')
@UseGuards(JwtAuthGuard)
export class ExperienceController {
  constructor(private readonly service: ExperienceService) {}

  @Get()
  list(@CurrentUser() user: AccessClaims) {
    return this.service.list(user.sub);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AccessClaims, @Body() body: unknown) {
    const parsed = ExperienceCreateDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(user.sub, parsed.data);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    const parsed = ExperienceUpdateDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.update(user.sub, id, parsed.data);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.service.delete(user.sub, id);
  }
}
