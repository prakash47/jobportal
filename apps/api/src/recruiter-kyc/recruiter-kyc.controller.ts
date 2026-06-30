import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AccessClaims } from '@jobportal/auth';
import { CurrentUser, Roles } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { SaveKycDto, UploadKycDocumentDto } from './dto';
import { MAX_KYC_BYTES } from './kyc-validators';
import { RecruiterKycService } from './recruiter-kyc.service';

interface UploadedFileShape {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

// Recruiter Company-Verification (KYC) tab. Reads happen in the recruiter RSC via
// Prisma (reads/writes split); these endpoints own the mutations. RolesGuard +
// @Roles('RECRUITER') is the trusted (L3) auth boundary; the killswitch L3 gate
// lives in the service so even a direct POST is blocked when the flag is ON.
@Controller('recruiter/kyc')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RECRUITER')
export class RecruiterKycController {
  constructor(private readonly service: RecruiterKycService) {}

  @Get()
  get(@CurrentUser() user: AccessClaims) {
    return this.service.getKyc(user.sub);
  }

  @Put()
  async save(@CurrentUser() user: AccessClaims, @Body() body: unknown) {
    const parsed = SaveKycDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.saveKyc(user.sub, parsed.data);
  }

  @Post('documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_KYC_BYTES } }))
  async uploadDocument(
    @CurrentUser() user: AccessClaims,
    @UploadedFile() file: UploadedFileShape | undefined,
    @Body() body: unknown,
  ) {
    const parsed = UploadKycDocumentDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    if (!file) throw new BadRequestException('Missing file (form field name "file")');
    return this.service.uploadDocument(user.sub, parsed.data.docType, file);
  }

  @Delete('documents/:id')
  removeDocument(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.deleteDocument(user.sub, id);
  }

  @Get('documents/:id/download')
  download(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.getDocumentDownloadUrl(user.sub, id);
  }

  @Post('submit')
  submit(@CurrentUser() user: AccessClaims) {
    return this.service.submitKyc(user.sub);
  }
}
