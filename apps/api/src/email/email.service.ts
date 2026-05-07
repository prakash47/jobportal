import { Injectable } from '@nestjs/common';

@Injectable()
export class EmailService {
  async sendEmailVerification(toEmail: string, verifyUrl: string): Promise<void> {
    await this.send(toEmail, 'Verify your JobPortal email', `Click to verify: ${verifyUrl}`);
  }

  async sendPasswordReset(toEmail: string, resetUrl: string): Promise<void> {
    await this.send(toEmail, 'Reset your JobPortal password', `Reset link (expires in 15 min): ${resetUrl}`);
  }

  // Stub. Real Resend integration arrives in feature/observability or feature/email-pipeline.
  // Until then, log to console — works in dev (operator can grab the link from logs)
  // and is clearly identifiable in prod logs as a reminder to wire Resend.
  private async send(to: string, subject: string, body: string): Promise<void> {
    if (process.env.RESEND_API_KEY) {
      console.warn('[email] RESEND_API_KEY is set but the Resend client is not yet wired (feature/email-pipeline). Falling back to console.');
    }
    console.log('[email] (stub)');
    console.log(`  to: ${to}`);
    console.log(`  subject: ${subject}`);
    console.log(`  body: ${body}`);
  }
}
