import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard, type AuthedRequest } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessClaims } from '@jobportal/auth';
import { JobStateQueryDto, ListJobsQueryDto } from './dto';
import { JobSlugRedirect, PublicJobsService } from './public-jobs.service';

// Public job browse for the mobile client (ADR 0002 step 5).
//
// PUBLIC by omission of JwtAuthGuard — the same idiom as media.controller and
// alerts/unsubscribe. These mirror pages the website already serves to anyone.
//
// Versioned (`version: '1'`) so they land on /v1/*, while every pre-existing
// controller stays exactly where it is — see main.ts for why VERSION_NEUTRAL
// is the default.
@Controller({ path: 'jobs', version: '1' })
export class PublicJobsController {
  constructor(private readonly jobs: PublicJobsService) {}

  @Get()
  async list(@Query() query: unknown) {
    const parsed = ListJobsQueryDto.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.jobs.list(parsed.data);
  }

  // Optional auth: anonymous callers get the public view, while a job's owner,
  // its collaborators or an admin may preview one that is not public yet. A
  // missing or expired token means "anonymous", never 401 — see
  // OptionalJwtAuthGuard.
  @Get(':slug')
  @UseGuards(OptionalJwtAuthGuard)
  async detail(
    @Param('slug') slug: string,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      return await this.jobs.detail(slug, req.user ?? null);
    } catch (err) {
      if (err instanceof JobSlugRedirect) {
        // 308 keeps the method and body, which matters because a client may
        // follow this automatically. The service only throws this AFTER the
        // visibility check, so the title-bearing canonical slug in Location
        // cannot leak an unapproved job.
        res.status(HttpStatus.PERMANENT_REDIRECT);
        res.setHeader('Location', `/v1/jobs/${err.canonicalSlug}`);
        // Returned in the body too: a mobile client that does not follow
        // redirects can self-correct its stored slug without parsing headers.
        return { canonicalSlug: err.canonicalSlug };
      }
      throw err;
    }
  }
}

// Sits on the authenticated surface, not the public one — it reads the
// caller's own saved jobs and applications.
@Controller({ path: 'me/job-state', version: '1' })
@UseGuards(JwtAuthGuard)
export class JobStateController {
  constructor(private readonly jobs: PublicJobsService) {}

  // POST, not GET: 100 ids in a query string is long enough to trip proxy
  // limits, and this is a lookup rather than a cacheable resource.
  @Post()
  @HttpCode(HttpStatus.OK)
  async jobState(@Body() body: unknown, @CurrentUser() user: AccessClaims) {
    const parsed = JobStateQueryDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.jobs.jobState(user.sub, parsed.data.jobIds);
  }
}
