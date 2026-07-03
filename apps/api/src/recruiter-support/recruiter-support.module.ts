import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RecruiterSupportController } from './recruiter-support.controller';
import { RecruiterSupportService } from './recruiter-support.service';

// Recruiter Help & Support. AuthModule provides the guards (JwtAuthGuard /
// RolesGuard) and re-exports EmailModule (EmailService — the best-effort
// ops-inbox forwarder for new tickets + contact messages).
@Module({
  imports: [AuthModule],
  controllers: [RecruiterSupportController],
  providers: [RecruiterSupportService],
})
export class RecruiterSupportModule {}
