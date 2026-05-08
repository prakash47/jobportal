import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { AuthModule } from '../auth/auth.module';
import { CachePurgeModule } from '../cache-purge/cache-purge.module';
import { RecruiterPostQuotaModule } from '../recruiter-post-quota/quota.module';
import { RecruiterJobsController } from './recruiter-jobs.controller';
import { RecruiterJobsService } from './recruiter-jobs.service';

@Module({
  imports: [AuthModule, AlertsModule, CachePurgeModule, RecruiterPostQuotaModule],
  controllers: [RecruiterJobsController],
  providers: [RecruiterJobsService],
  exports: [RecruiterJobsService],
})
export class RecruiterJobsModule {}
