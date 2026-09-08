import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
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

  /** Every stored version, newest first, with which one is active. */
  @Get('versions')
  versions(@CurrentUser() user: AccessClaims) {
    return this.service.listVersions(user.sub);
  }

  /**
   * A 15-min signed URL for the caller's own resume.
   *
   * No longer flag-gated — see ResumeService.getDownloadUrl for the reasoning.
   * Ownership scoping is what protects this endpoint, not the flag.
   */
  @Get('download')
  download(@CurrentUser() user: AccessClaims) {
    return this.service.getDownloadUrl(user.sub);
  }

  /** Same, for one specific stored version. */
  @Get(':id/download')
  downloadVersion(@CurrentUser() user: AccessClaims, @Param('id', ParseIntPipe) id: number) {
    return this.service.getDownloadUrl(user.sub, id);
  }

  /** Promote a stored version to the one recruiters receive. */
  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  activate(@CurrentUser() user: AccessClaims, @Param('id', ParseIntPipe) id: number) {
    return this.service.setActive(user.sub, id);
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
