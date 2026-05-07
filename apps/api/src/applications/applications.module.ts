import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { ApplicationQuotaGuard } from './quota.guard';
import { ApplicationQuotaService } from './quota.service';

@Module({
  imports: [AuthModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService, ApplicationQuotaService, ApplicationQuotaGuard],
  exports: [ApplicationsService, ApplicationQuotaService],
})
export class ApplicationsModule {}
