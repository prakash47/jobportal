import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { AuthModule } from '../auth/auth.module';
import { CachePurgeModule } from '../cache-purge/cache-purge.module';
import { JobPublishEffectsService } from './job-publish-effects.service';

// Standalone so BOTH make-live paths can depend on it without depending on each
// other: RecruiterJobsModule (recruiter create/publish/reopen/close) and
// AdminJobsModule (admin approve/reject). AuthModule is imported for its
// re-exported EmailModule — the same route RecruiterJobsModule already takes to
// reach EmailService.
@Module({
  imports: [AuthModule, AlertsModule, CachePurgeModule],
  providers: [JobPublishEffectsService],
  exports: [JobPublishEffectsService],
})
export class JobEffectsModule {}
