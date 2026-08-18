import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AccessClaims } from '@jobportal/auth';
import { CurrentUser } from '../auth/current-user.decorator';
import { AdminGuard } from '../feature-flags/admin.guard';
import { AdminTransactionsService } from './admin-transactions.service';
import { ExportTransactionsDto } from './dto';

// CSV export for the Transaction & Revenue Log (/sadmin/transactions).
// AdminGuard verifies the JWT and enforces role === 'ADMIN' (assigned only by
// direct DB write per CLAUDE.md §9) — the non-bypassable Layer 3 boundary. The
// console's own requireSuperAdmin() is Layer 2 and is never the trust boundary.
//
// EXPORT ONLY. The console's list and detail screens read Postgres directly in
// their RSCs, per the repo's reads/writes split — the same thing
// /sadmin/job-postings, /candidates and /subscriptions do. This endpoint exists
// here because an export is an AUDITED extraction: writing the ProfileAuditLog
// row is a write, and a route handler in apps/sadmin doing its own
// prisma.paymentOrder.findMany() would bypass AdminGuard, the killswitch and
// the audit row all at once.
//
// ⚠ POST, not GET, for a read. Two reasons: a GET can be fired by a link
// prefetcher, a crawler or a browser's address-bar speculation, each of which
// would forge an audit row attributing an extraction to an admin who never
// asked for one — the same reasoning admin-otp-sessions applies to revealing a
// code. And a POST body carries typed JSON, where Express query params are
// string-only.
//
// No `version: '1'` — admin routes carry no /v1 prefix; wiring the console to
// /v1/admin/... yields 404s. No @Throttle — no admin controller has one and the
// global 100/min ThrottlerGuard already applies.
@Controller('admin/transactions')
@UseGuards(AdminGuard)
export class AdminTransactionsController {
  constructor(private readonly service: AdminTransactionsService) {}

  @Post('export')
  @HttpCode(HttpStatus.OK)
  async export(
    @CurrentUser() admin: AccessClaims,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    // Body is `unknown` and hand-parsed: this app has no global ValidationPipe,
    // so a typed `@Body() dto: ExportTransactionsInput` would be a compile-time
    // fiction with zero runtime checking.
    const parsed = ExportTransactionsDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);

    const { filename, csv } = await this.service.export(admin.sub, parsed.data);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(csv);
  }
}
