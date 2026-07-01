import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RecruiterUsersController } from './recruiter-users.controller';
import { RecruiterUsersService } from './recruiter-users.service';

// SRS §4.9 — recruiter Team / User management. AuthModule provides the guards
// (JwtAuthGuard / RolesGuard), AuthService (issueSession — auto-login on invite
// accept), and re-exports EmailModule (EmailService — the invite email producer).
@Module({
  imports: [AuthModule],
  controllers: [RecruiterUsersController],
  providers: [RecruiterUsersService],
})
export class RecruiterUsersModule {}
