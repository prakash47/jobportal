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
  UseGuards,
} from '@nestjs/common';
import type { AccessClaims } from '@jobportal/auth';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApplyDto } from './dto';
import { ApplicationsService } from './applications.service';

@Controller('applications')
@UseGuards(JwtAuthGuard)
export class ApplicationsController {
  constructor(private readonly service: ApplicationsService) {}

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

  // GET /applications/me/:jobId — used by the web detail page to derive
  // the initial Apply button state on the server before hydration.
  @Get('me/:jobId')
  async myApplicationForJob(
    @CurrentUser() user: AccessClaims,
    @Param('jobId', ParseIntPipe) jobId: number,
  ) {
    const app = await this.service.findUserApplication(user.sub, jobId);
    return { applied: app !== null, status: app?.status ?? null };
  }
}
