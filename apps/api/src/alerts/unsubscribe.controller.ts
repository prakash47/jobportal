import { Controller, Get, Param } from '@nestjs/common';
import { AlertsService } from './alerts.service';

// SRS §4.5.6 — public unsubscribe endpoint. NOT behind JwtAuthGuard because
// the email link is sent to the user's inbox; we cannot assume they are
// signed in when they click it. The high-entropy unsubscribeToken is the
// capability. Idempotent: re-visiting the link is a no-op (still returns the
// alert name so the landing page renders consistently).

@Controller('alerts/unsubscribe')
export class UnsubscribeController {
  constructor(private readonly service: AlertsService) {}

  @Get(':token')
  async unsubscribe(@Param('token') token: string) {
    return this.service.unsubscribeByToken(token);
  }
}
