import { Module } from '@nestjs/common';
import { RecruiterPostQuotaGuard } from './quota.guard';
import { RecruiterPostQuotaService } from './quota.service';

@Module({
  providers: [RecruiterPostQuotaService, RecruiterPostQuotaGuard],
  exports: [RecruiterPostQuotaService, RecruiterPostQuotaGuard],
})
export class RecruiterPostQuotaModule {}
