import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AccessClaims } from '@jobportal/auth';
import { isCriticalFlag } from '@jobportal/feature-flags';
import { CurrentUser } from '../auth/current-user.decorator';
import { FeatureFlagsService } from './feature-flags.service';
import { RequireAdminScope } from '../auth/admin-scope.decorator';
import { AdminGuard } from './admin.guard';
import { AuditLogQuerySchema, FlagPatchSchema } from './dto';

// system/READ_ONLY floor, system/EDIT on the write. Since `system` is NONE for
// every assignable staff tier and is non-overridable (clampSystem), this whole
// controller is SUPER_ADMIN-only in practice — which is the point. Whoever can
// write flags can switch off the killswitches that gate every other module, so
// a Content Admin with flag access would make every other scope in the model
// decorative.
@Controller('admin/feature-flags')
@UseGuards(AdminGuard)
@RequireAdminScope('system', 'READ_ONLY')
export class FeatureFlagsController {
  constructor(private readonly service: FeatureFlagsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  // SRS §7.7 — paginated audit log for /admin/audit-log?type=feature_flag.
  // Defined BEFORE the @Get(':key') route so 'audit-log' isn't swallowed
  // by the param matcher.
  @Get('audit-log')
  auditLog(@Query() query: unknown) {
    const result = AuditLogQuerySchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException(result.error.issues);
    }
    return this.service.auditLog(result.data);
  }

  @Get(':key')
  async get(@Param('key') key: string) {
    const flag = await this.service.get(key);
    if (!flag) throw new NotFoundException(`Flag not found: ${key}`);
    return flag;
  }

  @RequireAdminScope('system', 'EDIT')
  @Patch(':key')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('key') key: string,
    @CurrentUser() user: AccessClaims,
    @Body() body: unknown,
  ) {
    const result = FlagPatchSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.issues);
    }
    const { reason, ...patch } = result.data;

    // SRS §7.7 — critical flags REQUIRE a reason at the API boundary so
    // a curl/Postman bypass of the admin UI's confirmation dialog can't
    // toggle a killswitch without leaving an explanation in the audit
    // log. The UI also enforces this client-side; this is the trust
    // boundary.
    if (isCriticalFlag(key) && (!reason || reason.trim().length === 0)) {
      throw new BadRequestException(
        `Reason required for critical flag: ${key}`,
      );
    }

    // AdminGuard has already verified user.role === 'ADMIN'; we still
    // pass it through so the @jobportal/feature-flags assertion has the
    // right shape (defense-in-depth at the storage boundary).
    const actor = { userId: user.sub, email: user.email, role: 'ADMIN' as const };
    return this.service.update(key, patch, actor, reason);
  }
}
