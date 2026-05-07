import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AccessClaims } from '@jobportal/auth';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AlertCreateDto, AlertUpdateDto } from './dto';
import { AlertsQueueService } from './alerts.queue';
import { AlertsService } from './alerts.service';

@Controller('me/alerts')
@UseGuards(JwtAuthGuard)
export class AlertsController {
  constructor(
    private readonly service: AlertsService,
    private readonly queue: AlertsQueueService,
  ) {}

  @Get()
  list(@CurrentUser() user: AccessClaims) {
    return this.service.list(user.sub);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AccessClaims, @Body() body: unknown) {
    const parsed = AlertCreateDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(user.sub, parsed.data);
  }

  @Get(':id')
  get(@CurrentUser() user: AccessClaims, @Param('id', ParseIntPipe) id: number) {
    return this.service.get(user.sub, id);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    const parsed = AlertUpdateDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.update(user.sub, id, parsed.data);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.service.delete(user.sub, id);
  }

  // SRS §4.5.5 — manual test send. Layer 2 of the killswitch enforcement
  // (Layer 1 = worker, Layer 3 = UI). Returns 403 when the killswitch is ON
  // even if the UI hides the button or someone POSTs directly.
  @Post(':id/test')
  @HttpCode(HttpStatus.ACCEPTED)
  async test(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.service.assertCanRunTestOrFail();
    const alert = await this.service.get(user.sub, id);
    await this.queue.enqueueScan(alert.id);
    return { queued: true };
  }
}
