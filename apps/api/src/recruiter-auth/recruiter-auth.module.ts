import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RecruiterAuthController } from './recruiter-auth.controller';
import { RecruiterPasswordService } from './recruiter-password.service';
import { RecruiterRegistrationService } from './recruiter-registration.service';
import { RecruiterWorkEmailService } from './recruiter-work-email.service';

@Module({
  // AuthModule exports EmailService (for RecruiterWorkEmailService), AuthService
  // (issueSession — used by RecruiterPasswordService to re-mint the current
  // device's session after a change), and the JwtAuthGuard / RolesGuard the
  // change-password endpoint is protected by.
  imports: [AuthModule],
  controllers: [RecruiterAuthController],
  providers: [
    RecruiterRegistrationService,
    RecruiterWorkEmailService,
    RecruiterPasswordService,
  ],
  exports: [RecruiterRegistrationService, RecruiterWorkEmailService],
})
export class RecruiterAuthModule {}
