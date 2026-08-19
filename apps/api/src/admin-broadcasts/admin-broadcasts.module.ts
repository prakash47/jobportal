import { Module } from '@nestjs/common';
import { ResendClient } from '../email/resend-client';
import { AdminBroadcastsController } from './admin-broadcasts.controller';
import { AdminBroadcastsService } from './admin-broadcasts.service';
import { BroadcastsProcessor } from './broadcasts.processor';
import { BroadcastsQueueService } from './broadcasts.queue';

/**
 * Admin Broadcast Notifications (/sadmin/broadcasts).
 *
 * ⚠ `ResendClient` is provided HERE rather than imported from `EmailModule`, and
 * that is deliberate on both sides. EmailModule's own comment states that the
 * queue, DLQ, processor and Resend client are encapsulated and that consumers
 * depend on `EmailService`, its public producer API — but every method on that
 * API enqueues onto the `transactional-emails` queue, which is exactly the path
 * this feature must not take: that worker runs at concurrency 1 with no rate
 * limiter, so a platform-wide send would go out one email at a time AND
 * head-of-line block every password reset behind it.
 *
 * So broadcasts own their delivery path end to end — their own queue, their own
 * retry policy, their own limiter — and providing the client locally says that
 * plainly, instead of widening EmailModule's exports and quietly breaking the
 * encapsulation it documents. `ResendClient` is stateless (it reads the env and
 * constructs a Resend instance per call), so a second DI instance costs nothing.
 *
 * The trade-off this creates is handled in the processor: a direct Resend call
 * escapes `killswitch.transactional_emails` the way `sendJobAlert` already does,
 * so the broadcast worker checks that flag explicitly alongside its own.
 *
 * AdminGuard is imported directly by the controller (it lives in feature-flags/,
 * mirroring admin-kyc and admin-support) and needs no provider entry.
 */
@Module({
  controllers: [AdminBroadcastsController],
  providers: [AdminBroadcastsService, BroadcastsProcessor, BroadcastsQueueService, ResendClient],
})
export class AdminBroadcastsModule {}
