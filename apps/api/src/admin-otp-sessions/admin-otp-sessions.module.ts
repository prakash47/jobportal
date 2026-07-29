import { Module } from '@nestjs/common';
import { AdminOtpSessionsController } from './admin-otp-sessions.controller';
import { AdminOtpSessionsService } from './admin-otp-sessions.service';

// No imports: the reveal path touches nothing but prisma, and AdminGuard is a
// self-contained class (it verifies the token itself rather than depending on
// AuthModule), which is why admin-jobs can import it the same way.
@Module({
  controllers: [AdminOtpSessionsController],
  providers: [AdminOtpSessionsService],
})
export class AdminOtpSessionsModule {}
