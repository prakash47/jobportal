import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import type { AuthedRequest } from '../auth/jwt-auth.guard';
import { CreateReportDto } from './dto';
import { ReportsService } from './reports.service';

// POST /v1/reports — "Report this job" on the public job detail page.
//
// Carries the /v1 prefix because it is part of the public, mobile-facing surface
// (versioning is VERSION_NEUTRAL by default, so only an explicit `version` opts
// in). The ADMIN side is /admin/reports with no prefix, matching every other
// admin controller.
//
// OptionalJwtAuthGuard, not JwtAuthGuard: reporting is deliberately open to
// logged-out visitors. /job/[slug] is public and SSR'd and most of its traffic
// is anonymous, so requiring an account would suppress exactly the fake-job
// reports most worth having. A signed-in reporter is attributed (which also
// enables the one-open-report-per-person rule); everyone else files anonymously.
// The guard never rejects, so an expired token degrades to anonymous rather than
// turning a public action into a 401.
@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  // 5/min per IP, well below the global 100/min. This is an unauthenticated
  // write, so the throttle is the primary defence against a flood of anonymous
  // reports; the per-person duplicate check cannot help there.
  //
  // ⚠️ Behind a proxy this bucket is only per-IP if TRUST_PROXY is set for the
  // deployment — see bugfix/trust-proxy-client-ip. Unset, every reporter shares
  // one bucket and 5/min becomes a global cap.
  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async create(@Body() body: unknown, @Req() req: AuthedRequest): Promise<{ id: number }> {
    const parsed = CreateReportDto.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.service.create(parsed.data, req.user?.sub ?? null, req.ip ?? null);
  }
}
