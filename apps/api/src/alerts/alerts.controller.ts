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
import { AlertsService } from './alerts.service';

@Controller('me/alerts')
@UseGuards(JwtAuthGuard)
export class AlertsController {
  constructor(private readonly service: AlertsService) {}

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

  // POST /me/alerts/:id/test arrives with the BullMQ queue in the next commit.
}
