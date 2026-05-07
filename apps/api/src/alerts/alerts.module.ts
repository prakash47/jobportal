import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AlertsController } from './alerts.controller';
import { AlertsIndexerHook } from './alerts.indexer-hook';
import { AlertsProcessor } from './alerts.processor';
import { AlertsQueueService } from './alerts.queue';
import { AlertsScheduler } from './alerts.scheduler';
import { AlertsService } from './alerts.service';
import { EmailPrefsController } from './email-prefs.controller';
import { UnsubscribeController } from './unsubscribe.controller';

@Module({
  imports: [AuthModule],
  controllers: [AlertsController, UnsubscribeController, EmailPrefsController],
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
