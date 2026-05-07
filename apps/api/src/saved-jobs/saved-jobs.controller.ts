import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AccessClaims } from '@jobportal/auth';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SavedJobsService } from './saved-jobs.service';

@Controller('saved-jobs')
@UseGuards(JwtAuthGuard)
export class SavedJobsController {
  constructor(private readonly service: SavedJobsService) {}

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

  @Get('me/:jobId')
  async myStateForJob(
    @CurrentUser() user: AccessClaims,
    @Param('jobId', ParseIntPipe) jobId: number,
  ) {
    const row = await this.service.findUserSaved(user.sub, jobId);
    return { saved: row !== null };
  }
}
