import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AccessClaims } from '@jobportal/auth';
import { CurrentUser, Roles } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UpdateRecruiterCompanyDto, UpdateRecruiterProfileDto } from './dto';
import { MAX_LOGO_BYTES } from './logo-validators';
import { RecruiterProfileService } from './recruiter-profile.service';

interface UploadedFileShape {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

// SRS §4.9.1 — recruiter Profile tab. Reads happen in the recruiter RSC via
// Prisma (reads/writes split); these endpoints own the mutations. RolesGuard +
// @Roles('RECRUITER') is the trusted (L3) enforcement boundary.
@Controller('recruiter')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RECRUITER')
export class RecruiterProfileController {
  constructor(private readonly service: RecruiterProfileService) {}

  @Get('profile')
  get(@CurrentUser() user: AccessClaims) {
    return this.service.getProfile(user.sub);
  }

  @Patch('profile')
  async patchProfile(@CurrentUser() user: AccessClaims, @Body() body: unknown) {
    const parsed = UpdateRecruiterProfileDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.updateProfile(user.sub, parsed.data);
  }

  @Patch('company')
  async patchCompany(@CurrentUser() user: AccessClaims, @Body() body: unknown) {
    const parsed = UpdateRecruiterCompanyDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.updateCompany(user.sub, parsed.data);
  }

  @Post('company/logo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_LOGO_BYTES } }))
  uploadLogo(
    @CurrentUser() user: AccessClaims,
    @UploadedFile() file: UploadedFileShape | undefined,
  ) {
    if (!file) throw new BadRequestException('Missing file (form field name "file")');
    return this.service.uploadLogo(user.sub, file);
  }

  @Delete('company/logo')
  removeLogo(@CurrentUser() user: AccessClaims) {
    return this.service.removeLogo(user.sub);
  }
}
