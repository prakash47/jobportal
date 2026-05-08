import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import {
  ListApplicantsQueryDto,
  SetApplicantNotesDto,
  TransitionApplicationDto,
} from './dto';
import { RecruiterApplicantsService } from './recruiter-applicants.service';

@Controller('recruiter')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RECRUITER')
export class RecruiterApplicantsController {
  constructor(private readonly service: RecruiterApplicantsService) {}

  @Get('jobs/:jobId/applicants')
  async list(
    @CurrentUser() user: AccessClaims,
    @Param('jobId', ParseIntPipe) jobId: number,
    @Query() query: unknown,
  ) {
    const parsed = ListApplicantsQueryDto.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.list(user.sub, jobId, parsed.data);
  }

  @Post('applications/:id/transition')
  @HttpCode(HttpStatus.OK)
  async transition(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    const parsed = TransitionApplicationDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const updated = await this.service.transition(user.sub, id, parsed.data.status);
    return { id: updated.id, status: updated.status, updatedAt: updated.updatedAt };
  }

  @Patch('applications/:id/notes')
  async setNotes(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    const parsed = SetApplicantNotesDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.setNotes(user.sub, id, parsed.data.notes);
  }

  @Get('applications/:id/resume')
  resume(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.getResumeUrl(user.sub, id);
  }
}
