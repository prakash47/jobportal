import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  RecruiterNotificationPreferencesController,
  RecruiterNotificationsController,
} from './recruiter-notifications.controller';
import { NotificationsProducerService } from './notifications-producer.service';
import { RecruiterNotificationsService } from './recruiter-notifications.service';

// Recruiter notifications: the bell feed + preference toggles + the producer
// that writes notification rows at source events. NotificationsProducerService
// is exported so ApplicationsModule + AdminKycModule can emit notifications
// without depending on the controllers/auth.
@Module({
  imports: [AuthModule],
  controllers: [RecruiterNotificationsController, RecruiterNotificationPreferencesController],
  providers: [RecruiterNotificationsService, NotificationsProducerService],
  exports: [NotificationsProducerService],
})
export class RecruiterNotificationsModule {}
