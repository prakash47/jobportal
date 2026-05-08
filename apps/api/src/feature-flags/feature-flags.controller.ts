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

    // STUB actor — real userId comes from the JWT context once feature/auth-jwt-system lands.
    const actor = { userId: 0 };
    return this.service.update(key, patch, actor, reason);
  }
}
