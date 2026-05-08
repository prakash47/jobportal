import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { RecruiterApplicantsController } from './recruiter-applicants.controller';
import { RecruiterApplicantsService } from './recruiter-applicants.service';

@Module({
  // AuthModule exports EmailService + RolesGuard + JwtAuthGuard.
  imports: [AuthModule, StorageModule],
  controllers: [RecruiterApplicantsController],
  providers: [RecruiterApplicantsService],
  exports: [RecruiterApplicantsService],
})
export class RecruiterApplicantsModule {}
