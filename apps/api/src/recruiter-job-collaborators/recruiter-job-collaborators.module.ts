import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RecruiterNotificationsModule } from '../recruiter-notifications/recruiter-notifications.module';
import { RecruiterJobCollaboratorsController } from './recruiter-job-collaborators.controller';
import { RecruiterJobCollaboratorsService } from './recruiter-job-collaborators.service';

// SRS §4.9 Job Detail → Collaborate. Imports RecruiterNotificationsModule for the
// exported NotificationsProducerService (to notify an added teammate) and
// AuthModule for the JWT/roles guards.
@Module({
  imports: [AuthModule, RecruiterNotificationsModule],
  controllers: [RecruiterJobCollaboratorsController],
  providers: [RecruiterJobCollaboratorsService],
})
export class RecruiterJobCollaboratorsModule {}
