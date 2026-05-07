import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AccessClaims } from '@jobportal/auth';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ResumeService } from './resume.service';
import { MAX_RESUME_BYTES } from './validators';

interface UploadedFileShape {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Controller('me/resume')
@UseGuards(JwtAuthGuard)
export class ResumeController {
  constructor(private readonly service: ResumeService) {}

  @Get()
  get(@CurrentUser() user: AccessClaims) {
    return this.service.getActive(user.sub);
  }

  // Returns a 15-min signed URL — gated by feature.resume_download_pdf at the
  // API layer (third of three enforcement layers per CLAUDE.md §4).
  @Get('download')
  download(@CurrentUser() user: AccessClaims) {
    return this.service.getDownloadUrl(user.sub);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_RESUME_BYTES },
    }),
  )
  upload(
    @CurrentUser() user: AccessClaims,
    @UploadedFile() file: UploadedFileShape | undefined,
  ) {
    if (!file) throw new BadRequestException('Missing file (form field name "file")');
    return this.service.upload(user.sub, file);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AccessClaims) {
    await this.service.delete(user.sub);
  }
}
