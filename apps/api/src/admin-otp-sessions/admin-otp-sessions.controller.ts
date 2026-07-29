import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AccessClaims } from '@jobportal/auth';
import { CurrentUser } from '../auth/current-user.decorator';
import { AdminGuard } from '../feature-flags/admin.guard';
import { AdminOtpSessionsService } from './admin-otp-sessions.service';

// Signup OTP relay console (SRS §4.9). AdminGuard verifies the JWT and enforces
// role === 'ADMIN' (assigned only by direct DB write per CLAUDE.md §9) — the
// non-bypassable boundary, same as admin-jobs.
//
// There is no list endpoint here on purpose: /sadmin/otp-sessions reads the
// challenge rows straight from Postgres in its server component, the way the
// dashboard counts do. Only the reveal crosses into the API, because only the
// reveal has a side effect (the audit row) worth centralising.
//
// Not gated by killswitch.new_registrations: freezing signups must not strand
// the people who already have a code in flight and are on the phone waiting
// for it, which is the same reasoning the KYC and job-moderation admin
// controllers document for their own feature flags.
@Controller('admin/otp-sessions')
@UseGuards(AdminGuard)
export class AdminOtpSessionsController {
  constructor(private readonly service: AdminOtpSessionsService) {}

  // 200, not the POST default 201 — nothing is created that the caller can
  // address.
  @Post(':id/reveal')
  @HttpCode(HttpStatus.OK)
  reveal(@CurrentUser() admin: AccessClaims, @Param('id', ParseIntPipe) id: number) {
    return this.service.reveal(admin.sub, id);
  }
}
