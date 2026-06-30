import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClamAVModule } from '../clamav/clamav.module';
import { StorageModule } from '../storage/storage.module';
import { RecruiterKycController } from './recruiter-kyc.controller';
import { RecruiterKycService } from './recruiter-kyc.service';

@Module({
  imports: [AuthModule, StorageModule, ClamAVModule],
  controllers: [RecruiterKycController],
  providers: [RecruiterKycService],
})
export class RecruiterKycModule {}
