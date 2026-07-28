import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AccessClaims } from '@jobportal/auth';
import { CurrentUser } from '../auth/current-user.decorator';
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
}
