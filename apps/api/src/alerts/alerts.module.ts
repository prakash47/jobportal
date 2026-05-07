import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AlertsController } from './alerts.controller';
import { AlertsProcessor } from './alerts.processor';
import { AlertsQueueService } from './alerts.queue';
import { AlertsService } from './alerts.service';

@Module({
  imports: [AuthModule],
  controllers: [AlertsController],
  providers: [AlertsService, AlertsProcessor, AlertsQueueService],
  exports: [AlertsService, AlertsQueueService],
})
export class AlertsModule {}
