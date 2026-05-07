import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AccessClaims } from '@jobportal/auth';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApplyDto, ListApplicationsQueryDto } from './dto';
import { ApplicationsService } from './applications.service';

@Controller('me/applications')
@UseGuards(JwtAuthGuard)
export class ApplicationsController {
  constructor(private readonly service: ApplicationsService) {}

  // SRS §4.6.1 — dashboard list. ?status=APPLIED|...|ALL filters; ?page=N
  // is 1-indexed. Defaults: status=ALL, page=1.
  @Get()
  async list(@CurrentUser() user: AccessClaims, @Query() query: unknown) {
    const parsed = ListApplicationsQueryDto.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.list(user.sub, parsed.data);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async apply(@Body() body: unknown, @CurrentUser() user: AccessClaims) {
    const parsed = ApplyDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const app = await this.service.apply(user.sub, parsed.data.jobId, parsed.data.coverLetter);
    return {
      id: app.id,
      jobId: app.jobId,
      status: app.status,
      appliedAt: app.appliedAt,
    };
  }

  // SRS §4.6.2 — candidate-driven WITHDRAW. State machine in
  // applications/state-machine.ts owns the validity check.
  @Post(':id/withdraw')
  @HttpCode(HttpStatus.OK)
  async withdraw(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const updated = await this.service.withdraw(user.sub, id);
    return { id: updated.id, status: updated.status, updatedAt: updated.updatedAt };
  }
}
