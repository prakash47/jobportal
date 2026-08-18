import { BadRequestException, Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import type { AccessClaims } from '@jobportal/auth';
import { CurrentUser } from '../auth/current-user.decorator';
import { ParseInt32IdPipe } from '../common/parse-int32-id.pipe';
import { AdminGuard } from '../feature-flags/admin.guard';
import { AdminReportsService } from './admin-reports.service';
import { UpdateReportDto } from './dto';

// The admin half of content reports, for /sadmin/reports. AdminGuard verifies
// the JWT and enforces role === 'ADMIN' (assigned only by direct DB write per
// CLAUDE.md §9) — the non-bypassable Layer 3 boundary. The console's own
// requireSuperAdmin() is Layer 2 and is never the trust boundary.
//
// No `/v1`: versioning is VERSION_NEUTRAL by default and only controllers that
// pass `version: '1'` carry the prefix. The intake side (POST /v1/reports) does;
// every admin controller in this app does not, and this matches them.
//
// WRITES ONLY. The queue and detail screens read Postgres directly in their
// RSCs, per the repo's reads/writes split — the same thing /sadmin/job-postings
// and /sadmin/subscriptions do. What must NOT happen is the reverse: a server
// action wrapping prisma.contentReport.update() in apps/sadmin would bypass
// AdminGuard, the killswitch, both audit rows AND the Elasticsearch de-index in
// a single move.
//
// Deliberately NOT gated by `moderation.reports.enabled`: that flag governs
// whether USERS can file reports. Switching intake off must still leave staff
// able to clear a queue that already has rows in it — the rule admin-jobs,
// admin-support and admin-otp-sessions already follow. The gate here is
// `killswitch.admin_report_write`, checked in the service.
@Controller('admin/reports')
@UseGuards(AdminGuard)
export class AdminReportsController {
  constructor(private readonly service: AdminReportsService) {}

  // ParseInt32IdPipe, not Nest's ParseIntPipe. ParseIntPipe happily accepts
  // 99999999999 — a valid JS integer that overflows Postgres int4, which makes
  // Prisma THROW rather than match no rows, escaping as an unhandled 500. This
  // repo has shipped that same bug three times; the pipe exists so the fix is
  // reusable rather than re-derived a fourth.
  @Patch(':id')
  async update(
    @CurrentUser() admin: AccessClaims,
    @Param('id', ParseInt32IdPipe) id: number,
    @Body() body: unknown,
  ) {
    const parsed = UpdateReportDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.update(admin.sub, id, parsed.data);
  }
}
