import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AlertsController } from './alerts.controller';
import { AlertsIndexerHook } from './alerts.indexer-hook';
import { AlertsProcessor } from './alerts.processor';
import { AlertsQueueService } from './alerts.queue';
import { AlertsScheduler } from './alerts.scheduler';
import { AlertsService } from './alerts.service';

@Module({
  imports: [AuthModule],
  controllers: [AlertsController],
  providers: [
    AlertsService,
    AlertsProcessor,
    AlertsQueueService,
    AlertsScheduler,
    AlertsIndexerHook,
  ],
  exports: [AlertsService, AlertsQueueService, AlertsIndexerHook],
})
export class AlertsModule {}
