import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AccessClaims } from '@jobportal/auth';
import { CurrentUser } from '../auth/current-user.decorator';
import { ParseInt32IdPipe } from '../common/parse-int32-id.pipe';
import { RequireAdminScope } from '../auth/admin-scope.decorator';
import { AdminGuard } from '../feature-flags/admin.guard';
import { AdminBillingService } from './admin-billing.service';
import { GrantSubscriptionDto, UpdateSubscriptionDto } from './dto';

// Admin subscription management for /sadmin/subscriptions. AdminGuard verifies
// the JWT and enforces role === 'ADMIN' (assigned only by direct DB write per
// CLAUDE.md §9) — the non-bypassable Layer 3 boundary. The console's own
// requireSuperAdmin() is Layer 2 and is never the trust boundary.
//
// WRITES ONLY, and that is the whole shape of this module. The console's list
// and detail screens read Postgres directly in their RSCs, per the repo's
// reads/writes split — the same thing /sadmin/job-postings, /candidates and
// /employers do. What must NOT happen is the reverse: a server action wrapping
// prisma.subscription.update() in apps/sadmin would bypass AdminGuard, the
// killswitch and the audit row all at once.
//
// Deliberately NOT gated by subscription.system.enabled: that flag governs
// whether recruiters can BUY. Staff comping an account matters most precisely
// while the storefront is shut, which is the state the product ships in.
// Both routes here MINT ENTITLEMENTS — a comped subscription is money the
// platform chooses not to collect — so the whole controller sits at finance/EDIT
// rather than declaring a READ_ONLY floor it never uses.
@Controller('admin/billing')
@UseGuards(AdminGuard)
@RequireAdminScope('finance', 'EDIT')
export class AdminBillingController {
  constructor(private readonly service: AdminBillingService) {}

  @Post('subscriptions')
  async grant(@CurrentUser() admin: AccessClaims, @Body() body: unknown) {
    const parsed = GrantSubscriptionDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.grant(admin.sub, parsed.data);
  }

  @Patch('subscriptions/:id')
  async update(
    @CurrentUser() admin: AccessClaims,
    @Param('id', ParseInt32IdPipe) id: number,
    @Body() body: unknown,
  ) {
    const parsed = UpdateSubscriptionDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.update(admin.sub, id, parsed.data);
  }
}
