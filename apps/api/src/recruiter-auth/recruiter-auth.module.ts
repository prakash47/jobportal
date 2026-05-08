import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RecruiterAuthController } from './recruiter-auth.controller';
import { RecruiterRegistrationService } from './recruiter-registration.service';
import { RecruiterWorkEmailService } from './recruiter-work-email.service';

@Module({
  // AuthModule exports EmailService — needed by RecruiterWorkEmailService.
  imports: [AuthModule],
  controllers: [RecruiterAuthController],
  providers: [RecruiterRegistrationService, RecruiterWorkEmailService],
  exports: [RecruiterRegistrationService, RecruiterWorkEmailService],
})
export class RecruiterAuthModule {}
