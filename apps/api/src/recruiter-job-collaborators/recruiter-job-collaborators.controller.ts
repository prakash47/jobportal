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
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AccessClaims } from '@jobportal/auth';
import { CurrentUser, Roles } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AddCollaboratorDto } from './dto';
import { RecruiterJobCollaboratorsService } from './recruiter-job-collaborators.service';

// SRS §4.9 Job Detail → Collaborate. All routes are owner-only (the service
// checks postedById); add/remove are L3-gated by killswitch.recruiter_job_collaborate.
// Shares the `recruiter/jobs` prefix with RecruiterJobsController — `:id/
// collaborators` is a distinct path from `:id`, so there is no route conflict.
@Controller('recruiter/jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RECRUITER')
export class RecruiterJobCollaboratorsController {
  constructor(private readonly service: RecruiterJobCollaboratorsService) {}

  @Get(':id/collaborators')
  list(@CurrentUser() user: AccessClaims, @Param('id', ParseIntPipe) id: number) {
    return this.service.list(user.sub, id);
  }

  @Post(':id/collaborators')
  @HttpCode(HttpStatus.CREATED)
  add(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    const parsed = AddCollaboratorDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.add(user.sub, id, parsed.data.userId);
  }

  @Delete(':id/collaborators/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) collaboratorUserId: number,
  ) {
    await this.service.remove(user.sub, id, collaboratorUserId);
  }
}
