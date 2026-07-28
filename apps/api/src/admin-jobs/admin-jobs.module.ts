import { Module } from '@nestjs/common';
import { JobEffectsModule } from '../job-effects/job-effects.module';
import { RecruiterNotificationsModule } from '../recruiter-notifications/recruiter-notifications.module';
import { RecruiterPostQuotaModule } from '../recruiter-post-quota/quota.module';
import { AdminJobsController } from './admin-jobs.controller';
import { AdminJobsService } from './admin-jobs.service';

// JobEffectsModule gives approval the same ES + alerts + cache-purge + email
// sequence a recruiter publish fires. RecruiterPostQuotaModule is for the
// refund on rejection (the slot was consumed at submit time).
@Module({
  imports: [JobEffectsModule, RecruiterNotificationsModule, RecruiterPostQuotaModule],
  controllers: [AdminJobsController],
  providers: [AdminJobsService],
})
export class AdminJobsModule {}
