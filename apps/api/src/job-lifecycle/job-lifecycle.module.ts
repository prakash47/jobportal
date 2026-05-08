import { Module } from '@nestjs/common';
import { CachePurgeModule } from '../cache-purge/cache-purge.module';
import { JobLifecycleProcessor } from './job-lifecycle.processor';
import { JobLifecycleQueueService } from './job-lifecycle.queue';

@Module({
  imports: [CachePurgeModule],
  providers: [JobLifecycleProcessor, JobLifecycleQueueService],
  exports: [JobLifecycleProcessor],
})
export class JobLifecycleModule {}
