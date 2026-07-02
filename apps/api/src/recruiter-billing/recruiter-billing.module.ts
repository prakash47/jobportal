import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { RazorpayClient } from './razorpay.client';
import { RazorpayWebhookController } from './razorpay-webhook.controller';
import { RecruiterBillingController } from './recruiter-billing.controller';
import { RecruiterBillingService } from './recruiter-billing.service';

// Recruiter Plans & Billing (SRS §4.11 / §7): Razorpay prepaid plan purchase,
// GST invoices, webhook capture. AuthModule provides the guards + EmailService
// (re-exported EmailModule); StorageModule provides R2 for invoice PDFs.
@Module({
  imports: [AuthModule, StorageModule],
  controllers: [RecruiterBillingController, RazorpayWebhookController],
  providers: [RecruiterBillingService, RazorpayClient],
})
export class RecruiterBillingModule {}
