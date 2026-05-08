import { Module } from '@nestjs/common';
import { AlertsModule } from './alerts/alerts.module';
import { AppController } from './app.controller';
import { ApplicationsModule } from './applications/applications.module';
import { AuthModule } from './auth/auth.module';
import { CachePurgeModule } from './cache-purge/cache-purge.module';
import { ClamAVModule } from './clamav/clamav.module';
import { EmailModule } from './email/email.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { JobLifecycleModule } from './job-lifecycle/job-lifecycle.module';
import { ProfileModule } from './profile/profile.module';
import { RecruiterApplicantsModule } from './recruiter-applicants/recruiter-applicants.module';
import { RecruiterAuthModule } from './recruiter-auth/recruiter-auth.module';
import { RecruiterJobsModule } from './recruiter-jobs/recruiter-jobs.module';
import { RecruiterPostQuotaModule } from './recruiter-post-quota/quota.module';
import { RedisModule } from './redis/redis.module';
import { ResumeModule } from './resume/resume.module';
import { SavedJobsModule } from './saved-jobs/saved-jobs.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    RedisModule,
    EmailModule,
    AuthModule,
    RecruiterAuthModule,
    FeatureFlagsModule,
    ApplicationsModule,
    SavedJobsModule,
    CachePurgeModule,
    StorageModule,
    ClamAVModule,
    ProfileModule,
    ResumeModule,
    AlertsModule,
    RecruiterPostQuotaModule,
    RecruiterJobsModule,
    RecruiterApplicantsModule,
    JobLifecycleModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
