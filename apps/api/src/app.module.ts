import { Module } from '@nestjs/common';
import { SentryModule } from '@sentry/nestjs/setup';
import { AdminKycModule } from './admin-kyc/admin-kyc.module';
import { AdminSupportModule } from './admin-support/admin-support.module';
import { AlertsModule } from './alerts/alerts.module';
import { AppController } from './app.controller';
import { ApplicationsModule } from './applications/applications.module';
import { AuthModule } from './auth/auth.module';
import { CachePurgeModule } from './cache-purge/cache-purge.module';
import { ClamAVModule } from './clamav/clamav.module';
import { EmailModule } from './email/email.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { JobLifecycleModule } from './job-lifecycle/job-lifecycle.module';
import { MediaModule } from './media/media.module';
import { NotificationsPreferencesModule } from './notifications-preferences/notifications-preferences.module';
import { ProfileModule } from './profile/profile.module';
import { RecruiterApplicantsModule } from './recruiter-applicants/recruiter-applicants.module';
import { RecruiterAuthModule } from './recruiter-auth/recruiter-auth.module';
import { RecruiterBillingModule } from './recruiter-billing/recruiter-billing.module';
import { RecruiterJobCollaboratorsModule } from './recruiter-job-collaborators/recruiter-job-collaborators.module';
import { RecruiterJobsModule } from './recruiter-jobs/recruiter-jobs.module';
import { RecruiterKycModule } from './recruiter-kyc/recruiter-kyc.module';
import { RecruiterNotificationsModule } from './recruiter-notifications/recruiter-notifications.module';
import { RecruiterProfileModule } from './recruiter-profile/recruiter-profile.module';
import { RecruiterPostQuotaModule } from './recruiter-post-quota/quota.module';
import { RecruiterSupportModule } from './recruiter-support/recruiter-support.module';
import { RecruiterUsersModule } from './recruiter-users/recruiter-users.module';
import { RedisModule } from './redis/redis.module';
import { ResumeModule } from './resume/resume.module';
import { SavedJobsModule } from './saved-jobs/saved-jobs.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    // SentryModule.forRoot() wires Sentry into the Nest request
    // lifecycle (auto-trace per request, breadcrumb the route handler).
    // Must come BEFORE any module whose providers we want traced.
    SentryModule.forRoot(),
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
    RecruiterJobCollaboratorsModule,
    RecruiterApplicantsModule,
    RecruiterProfileModule,
    RecruiterKycModule,
    RecruiterNotificationsModule,
    RecruiterUsersModule,
    RecruiterBillingModule,
    RecruiterSupportModule,
    AdminKycModule,
    AdminSupportModule,
    JobLifecycleModule,
    NotificationsPreferencesModule,
    MediaModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
