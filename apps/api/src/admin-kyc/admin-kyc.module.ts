import { Module } from '@nestjs/common';
import { RecruiterNotificationsModule } from '../recruiter-notifications/recruiter-notifications.module';
import { StorageModule } from '../storage/storage.module';
import { AdminKycController } from './admin-kyc.controller';
import { AdminKycService } from './admin-kyc.service';

@Module({
  imports: [StorageModule, RecruiterNotificationsModule],
  controllers: [AdminKycController],
  providers: [AdminKycService],
})
export class AdminKycModule {}
