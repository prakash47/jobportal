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
import { RequireAdminScope } from '../auth/admin-scope.decorator';
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
// otp_reveal, NOT verification — and EDIT, not READ_ONLY, despite the payload
// being a read.
//
// Revealing a signup OTP hands staff the code needed to complete someone else's
// login. It is the closest thing to an account-takeover primitive this console
// has, and it is the capability a socially-engineered support agent is most
// likely to be talked into using. Filing it under `verification` would mean
// granting a support agent the ability to look at a company's KYC documents
// silently also granted them every user's live login code; requiring only
// READ_ONLY would mean any view-level grant on this module carried it. Both are
// the wrong default, so it is its own module and it takes a deliberate full
// grant, held by nobody but SUPER_ADMIN out of the box.
@Controller('admin/otp-sessions')
@UseGuards(AdminGuard)
@RequireAdminScope('otp_reveal', 'EDIT')
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
