import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JobEffectsModule } from '../job-effects/job-effects.module';
import { RecruiterPostQuotaModule } from '../recruiter-post-quota/quota.module';
import { RecruiterJobsController } from './recruiter-jobs.controller';
import { RecruiterJobsService } from './recruiter-jobs.service';

// AlertsModule + CachePurgeModule are no longer imported directly: the ES /
// alerts / cache-purge / email fan-out moved into JobEffectsModule so the admin
// moderation approve path fires the identical sequence.
@Module({
  imports: [AuthModule, JobEffectsModule, RecruiterPostQuotaModule],
  controllers: [RecruiterJobsController],
  providers: [RecruiterJobsService],
  exports: [RecruiterJobsService],
})
export class RecruiterJobsModule {}
