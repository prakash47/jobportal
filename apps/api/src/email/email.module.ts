import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { ResendClient } from './resend-client';
import { TransactionalEmailDlqService } from './transactional-email-dlq.queue';
import { TransactionalEmailProcessor } from './transactional-email.processor';
import { TransactionalEmailQueueService } from './transactional-email.queue';

// SRS §4.13 — single root for the email pipeline. Other modules import
// EmailModule and depend on EmailService (the public producer API). The
// queue, DLQ, processor, and Resend client are encapsulated.
@Module({
  providers: [
    EmailService,
    ResendClient,
    TransactionalEmailProcessor,
    TransactionalEmailDlqService,
    TransactionalEmailQueueService,
  ],
  exports: [EmailService],
})
export class EmailModule {}
