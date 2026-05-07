import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SavedJobsController } from './saved-jobs.controller';
import { SavedJobsService } from './saved-jobs.service';

@Module({
  imports: [AuthModule],
  controllers: [SavedJobsController],
  providers: [SavedJobsService],
  exports: [SavedJobsService],
})
export class SavedJobsModule {}
