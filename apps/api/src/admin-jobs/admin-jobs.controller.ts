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
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AccessClaims } from '@jobportal/auth';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequireAdminScope } from '../auth/admin-scope.decorator';
import { AdminGuard } from '../feature-flags/admin.guard';
import { AdminJobsService } from './admin-jobs.service';
import { ListAdminJobsQueryDto, ModerateJobDto } from './dto';

// Admin job-moderation console. AdminGuard verifies the JWT and enforces
// role === 'ADMIN' (assigned only by direct DB write per §9) — the
// non-bypassable boundary. Not gated by moderation.jobs.enabled: turning intake
// off must still leave admins able to clear a queue that already has jobs in
// it, matching the admin-kyc / admin-support precedent.
@Controller('admin/jobs')
@UseGuards(AdminGuard)
@RequireAdminScope('moderation', 'READ_ONLY')
export class AdminJobsController {
  constructor(private readonly service: AdminJobsService) {}

  @Get()
  async list(@Query() query: unknown) {
    const parsed = ListAdminJobsQueryDto.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.listJobs(parsed.data);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.getJobDetail(id);
  }

  @RequireAdminScope('moderation', 'EDIT')
  @Patch(':id')
  async moderate(
    @CurrentUser() admin: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    const parsed = ModerateJobDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.moderate(admin.sub, id, parsed.data);
  }

  // Hard-delete a posting from the Job Postings master list. Zero-application
  // jobs only — the service enforces that atomically and 409s otherwise.
  //
  // No body and therefore no DTO: the delete takes no options, so there is
  // nothing to validate beyond the id ParseIntPipe already coerces. That is a
  // decision rather than an omission — a reason field would make the JOB_DELETED
  // audit row richer, but it turns a one-click confirm into a form and can be
  // added additively later.
  //
  // 204, matching DELETE /recruiter/jobs/:id: there is no resource left to
  // return, and the sadmin client only branches on the status code.
  @RequireAdminScope('moderation', 'EDIT')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() admin: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.service.remove(admin.sub, id);
  }
}
