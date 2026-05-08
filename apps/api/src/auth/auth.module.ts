import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { PasswordResetService } from './password-reset.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { PerEmailThrottleGuard } from './per-email-throttle.guard';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    // Per SRS §4.12.7 first branch: 5 failed login attempts per minute per IP
    // is enforced via the @Throttle({ default: { limit: 5 } }) decorator on
    // /login. Sane global default for everything else.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    // EmailModule owns EmailService now (was awkwardly co-located with auth
    // before SRS §4.13 landed).
    EmailModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    EmailVerificationService,
    PasswordResetService,
    JwtAuthGuard,
    RolesGuard,
    PerEmailThrottleGuard,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [AuthService, JwtAuthGuard, RolesGuard, EmailModule],
})
export class AuthModule {}
