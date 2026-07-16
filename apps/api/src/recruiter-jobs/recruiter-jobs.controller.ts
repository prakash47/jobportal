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
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AccessClaims } from '@jobportal/auth';
import { CurrentUser, Roles } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RecruiterPostQuotaService } from '../recruiter-post-quota/quota.service';
import {
  CreateRecruiterJobDto,
  ListRecruiterJobsQueryDto,
  ReachQueryDto,
  SalaryTrendsQueryDto,
  UpdateRecruiterJobDto,
} from './dto';
import { RecruiterJobsService } from './recruiter-jobs.service';

@Controller('recruiter/jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RECRUITER')
export class RecruiterJobsController {
  constructor(
    private readonly service: RecruiterJobsService,
    private readonly quota: RecruiterPostQuotaService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AccessClaims, @Query() query: unknown) {
    const parsed = ListRecruiterJobsQueryDto.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.list(user.sub, parsed.data);
  }

  // SRS §4.9.7 — read-only quota state for the wizard's L2 UI hint.
  @Get('quota')
  getQuota(@CurrentUser() user: AccessClaims) {
    return this.quota.readState(user.sub);
  }

  // Post a Job Phase 4 — live sidebar widgets. Read-only, RECRUITER-guarded by
  // the class guard. Declared before ':id' so the literal paths don't get
  // captured by the ParseIntPipe param route.
  @Get('salary-trends')
  async salaryTrends(@Query() query: unknown) {
    const parsed = SalaryTrendsQueryDto.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.salaryTrends(parsed.data);
  }

  @Get('reach')
  async reach(@Query() query: unknown) {
    const parsed = ReachQueryDto.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.reach(parsed.data);
  }

  @Get(':id')
  getOne(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.getOne(user.sub, id);
  }

  // SRS §4.9.7 + CLAUDE.md §4 — three-layer quota enforcement (action, not
  // route). For job posting the layers are:
  //   L1 (UI): wizard's Publish button is disabled at-limit (cosmetic)
  //   L2 (Server-rendered hint): wizard server entry reads /quota and shows
  //       the at-limit message
  //   L3 (API service): RecruiterPostQuotaService.consume() inside
  //       service.create() — atomic INCR + DECR-revert; the only trusted
  //       check
  // The earlier RecruiterPostQuotaGuard L1 was dropped because it ran
  // BEFORE body parsing and rejected draft-saves at-limit even though
  // drafts never consume. The L3 atomic consume is the trust boundary.
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AccessClaims, @Body() body: unknown) {
    const parsed = CreateRecruiterJobDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(user.sub, parsed.data);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    const parsed = UpdateRecruiterJobDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.update(user.sub, id, parsed.data);
  }

  // Hard delete — own jobs with zero applications only (409 otherwise); L3
  // killswitch killswitch.recruiter_job_delete rejects with 503 when flipped ON.
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.service.delete(user.sub, id);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  close(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.close(user.sub, id);
  }

  @Post(':id/reopen')
  @HttpCode(HttpStatus.OK)
  reopen(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.reopen(user.sub, id);
  }
}
