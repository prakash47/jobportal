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
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProfilePatchDto } from './dto';
import { ProfileService, type ProfileView } from './profile.service';
import { ProfilePhotoService, type ProfilePhotoView } from './photo.service';
import { MAX_PHOTO_BYTES } from './photo-validators';

// Multer's shape. Declared locally exactly as resume.controller.ts and
// recruiter-kyc.controller.ts do, rather than importing Express types into a
// module that otherwise has no Express surface.
interface UploadedFileShape {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Controller('me/profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(
    private readonly service: ProfileService,
    private readonly photo: ProfilePhotoService,
  ) {}

  @Get()
  get(@CurrentUser() user: AccessClaims): Promise<ProfileView> {
    return this.service.getProfile(user.sub);
  }

  @Patch()
  async patch(
    @CurrentUser() user: AccessClaims,
    @Body() body: unknown,
  ): Promise<ProfileView> {
    const parsed = ProfilePatchDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.updateProfile(user.sub, parsed.data);
  }

  // SRS §4.3 — profile photo. The interceptor's fileSize limit is a SECOND
  // gate, not the only one: it rejects an oversized body before it is buffered,
  // while validatePhoto re-checks the size it actually received. Relying on
  // multer alone would leave the service trusting a number it never verified.
  @Post('photo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_BYTES } }))
  uploadPhoto(
    @CurrentUser() user: AccessClaims,
    @UploadedFile() file: UploadedFileShape | undefined,
  ): Promise<ProfilePhotoView> {
    if (!file) throw new BadRequestException('Missing file (form field name "file")');
    return this.photo.upload(user.sub, file);
  }

  @Delete('photo')
  removePhoto(@CurrentUser() user: AccessClaims): Promise<ProfilePhotoView> {
    return this.photo.remove(user.sub);
  }
}
