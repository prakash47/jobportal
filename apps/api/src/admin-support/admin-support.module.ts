import { Module } from '@nestjs/common';
import { RecruiterNotificationsModule } from '../recruiter-notifications/recruiter-notifications.module';
import { AdminSupportController } from './admin-support.controller';
import { AdminSupportService } from './admin-support.service';

// Admin Help & Support console. RecruiterNotificationsModule provides the
// NotificationsProducerService (the recruiter bell) for staff reply / status
// notifications. AdminGuard is imported directly by the controller (it lives in
// feature-flags/, mirroring admin-kyc).
@Module({
  imports: [RecruiterNotificationsModule],
  controllers: [AdminSupportController],
  providers: [AdminSupportService],
})
export class AdminSupportModule {}
