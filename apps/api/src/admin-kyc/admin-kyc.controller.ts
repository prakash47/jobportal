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
import { RequireAdminScope } from '../auth/admin-scope.decorator';
import { AdminGuard } from '../feature-flags/admin.guard';
import { AdminKycService } from './admin-kyc.service';
import { ListKycQueryDto, ReviewKycDto } from './dto';

// Admin Company-Verification (KYC) review console. AdminGuard verifies the JWT
// and enforces role === 'ADMIN' (assigned only by direct DB write per §9) — the
// non-bypassable boundary. Not gated by the recruiter killswitch: admins can
// still clear an existing backlog while new submissions are paused.
@Controller('admin/kyc')
@UseGuards(AdminGuard)
@RequireAdminScope('verification', 'READ_ONLY')
export class AdminKycController {
  constructor(private readonly service: AdminKycService) {}

  @Get()
  async list(@Query() query: unknown) {
    const parsed = ListKycQueryDto.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.listKyc(parsed.data);
  }

  @Get(':companyId')
  detail(@Param('companyId', ParseIntPipe) companyId: number) {
    return this.service.getKycDetail(companyId);
  }

  @RequireAdminScope('verification', 'EDIT')
  @Patch(':companyId')
  async review(
    @CurrentUser() admin: AccessClaims,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() body: unknown,
  ) {
    const parsed = ReviewKycDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.review(admin.sub, companyId, parsed.data);
  }
}
