import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { RecruiterBillingService } from './recruiter-billing.service';

// Razorpay server-to-server webhook. Unauthenticated by design — the HMAC of
// the RAW body against RAZORPAY_WEBHOOK_SECRET is the authentication (CLAUDE.md
// §3.2: signature-verified, idempotent; Razorpay publishes no stable source-IP
// allowlist, so the signature is the control). rawBody is available because
// main.ts boots Nest with { rawBody: true }. Throttle is above the global
// 100/min default: Razorpay bursts retries after an outage and a dropped
// delivery costs a paid-but-inactive order until the next retry.
@Controller('webhooks')
export class RazorpayWebhookController {
  constructor(private readonly billing: RecruiterBillingService) {}

  @Post('razorpay')
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature?: string,
    @Headers('x-razorpay-event-id') eventId?: string,
  ) {
    const raw = req.rawBody;
    if (!raw || raw.length === 0) throw new BadRequestException('Missing body');
    return this.billing.handleWebhook(raw, signature, eventId);
  }
}
