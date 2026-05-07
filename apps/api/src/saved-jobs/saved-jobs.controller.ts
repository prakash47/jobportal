import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AccessClaims } from '@jobportal/auth';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ListSavedJobsQueryDto } from './dto';
import { SavedJobsService } from './saved-jobs.service';

@Controller('me/saved-jobs')
@UseGuards(JwtAuthGuard)
export class SavedJobsController {
  constructor(private readonly service: SavedJobsService) {}

  // SRS §4.4 — paginated list joined with Job + Company.
  @Get()
  async list(@CurrentUser() user: AccessClaims, @Query() query: unknown) {
    const parsed = ListSavedJobsQueryDto.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.list(user.sub, parsed.data);
  }

  @Post(':jobId')
  @HttpCode(HttpStatus.CREATED)
  async save(
    @CurrentUser() user: AccessClaims,
    @Param('jobId', ParseIntPipe) jobId: number,
  ) {
    const row = await this.service.save(user.sub, jobId);
    return { saved: true, savedAt: row.savedAt };
  }

  @Delete(':jobId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsave(
    @CurrentUser() user: AccessClaims,
    @Param('jobId', ParseIntPipe) jobId: number,
  ) {
    await this.service.unsave(user.sub, jobId);
  }
}
