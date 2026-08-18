import { Module } from '@nestjs/common';
import { JobEffectsModule } from '../job-effects/job-effects.module';
import { AdminReportsController } from './admin-reports.controller';
import { AdminReportsService } from './admin-reports.service';

// JobEffectsModule supplies JobPublishEffectsService, which the takedown needs
// to de-index the closed posting from Elasticsearch and purge its cached detail
// page. Without it an upheld report would leave a searchable ghost.
@Module({
  imports: [JobEffectsModule],
  controllers: [AdminReportsController],
  providers: [AdminReportsService],
})
export class AdminReportsModule {}
