import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsPreferencesController } from './notifications-preferences.controller';
import { NotificationsPreferencesService } from './notifications-preferences.service';

@Module({
  imports: [AuthModule],
  controllers: [NotificationsPreferencesController],
  providers: [NotificationsPreferencesService],
  exports: [NotificationsPreferencesService],
})
export class NotificationsPreferencesModule {}
