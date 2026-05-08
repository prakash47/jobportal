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
import { isCriticalFlag } from '@jobportal/feature-flags';
import { FeatureFlagsService } from './feature-flags.service';
import { AdminGuard } from './admin.guard';
import { AuditLogQuerySchema, FlagPatchSchema } from './dto';

@Controller('admin/feature-flags')
@UseGuards(AdminGuard)
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

  @Patch(':key')
  @HttpCode(HttpStatus.OK)
  async update(@Param('key') key: string, @Body() body: unknown) {
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

    // STUB actor — userId still 0 until the JWT actor is wired into req.user
    // (tracked in chore/admin-flag-real-actor). role is set to 'ADMIN' here
    // so the new setFlag boundary check has the right shape; the userId
    // assertion will start passing as soon as the JWT plumbing lands. Until
    // then, expect setFlag to reject every PATCH at runtime — a deliberate
    // tradeoff: a noisy 500 is better than silently writing changedById=0
    // into the audit log forever.
    const actor = { userId: 0, role: 'ADMIN' as const };
    return this.service.update(key, patch, actor, reason);
  }
}
