import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JobStateController, PublicJobsController } from './public-jobs.controller';
import { PublicJobsService } from './public-jobs.service';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';

@Module({
  imports: [AuthModule],
  controllers: [PublicJobsController, JobStateController],
  providers: [PublicJobsService, OptionalJwtAuthGuard],
})
export class PublicJobsModule {}
