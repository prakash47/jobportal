import { Module } from '@nestjs/common';
import { JobLifecycleProcessor } from './job-lifecycle.processor';
import { JobLifecycleQueueService } from './job-lifecycle.queue';

@Module({
  providers: [JobLifecycleProcessor, JobLifecycleQueueService],
  exports: [JobLifecycleProcessor],
})
export class JobLifecycleModule {}
