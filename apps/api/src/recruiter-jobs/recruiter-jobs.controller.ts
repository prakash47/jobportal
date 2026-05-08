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
import { RecruiterPostQuotaGuard } from '../recruiter-post-quota/quota.guard';
import { RecruiterPostQuotaService } from '../recruiter-post-quota/quota.service';
import {
  CreateRecruiterJobDto,
  ListRecruiterJobsQueryDto,
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

  @Get(':id')
  getOne(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.getOne(user.sub, id);
  }

  // Layer 1 of three-layer quota enforcement. The guard's preflight() runs
  // BEFORE the controller method. The guard short-circuits drafts via the
  // body check would be ideal, but the guard runs before the body is parsed
  // — instead, the service's create() decides whether to consume based on
  // publishMode, so saving a draft never touches Redis.
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RecruiterPostQuotaGuard)
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
