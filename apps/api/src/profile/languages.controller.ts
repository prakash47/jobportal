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
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AccessClaims } from '@jobportal/auth';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LanguageCreateDto } from './dto';
import { LanguagesService } from './languages.service';

@Controller('me/languages')
@UseGuards(JwtAuthGuard)
export class LanguagesController {
  constructor(private readonly service: LanguagesService) {}

  @Get()
  list(@CurrentUser() user: AccessClaims) {
    return this.service.list(user.sub);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AccessClaims, @Body() body: unknown) {
    const parsed = LanguageCreateDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(user.sub, parsed.data);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AccessClaims, @Param('id', ParseIntPipe) id: number) {
    await this.service.delete(user.sub, id);
  }
}
