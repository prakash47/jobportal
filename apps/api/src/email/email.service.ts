import { Injectable } from '@nestjs/common';

// Redact one-time tokens from any URL embedded in the email body before
// logging. Reset and email-verification URLs include `?token=<value>` —
// anyone with read access to API stdout (operators, log shippers, support
// staff) could otherwise hijack a password reset or pre-verify a fresh
// account by grabbing the link from logs.
//
// We strip both `?token=` and `&token=` and replace the value with [REDACTED].
// The redaction also fires on a few common token query keys we might add
// later (`code`, `confirm`, etc.) to be safe.
const TOKEN_PARAM = /([?&])(token|code|confirm|nonce|t)=[^&\s)]+/gi;

function redactTokens(s: string): string {
  return s.replace(TOKEN_PARAM, '$1$2=[REDACTED]');
}

@Injectable()
export class EmailService {
  async sendEmailVerification(toEmail: string, verifyUrl: string): Promise<void> {
    await this.send(toEmail, 'Verify your JobPortal email', `Click to verify: ${verifyUrl}`);
  }

  async sendPasswordReset(toEmail: string, resetUrl: string): Promise<void> {
    await this.send(toEmail, 'Reset your JobPortal password', `Reset link (expires in 15 min): ${resetUrl}`);
  }

  // Stub. Real Resend integration arrives in feature/email-pipeline.
  // Until then, log to console with token values redacted — operators can
  // confirm an email "would have" gone out without being able to consume
  // the link themselves. Per CLAUDE.md §9 (security baselines: secrets must
  // never be logged in cleartext).
  private async send(to: string, subject: string, body: string): Promise<void> {
    if (process.env.RESEND_API_KEY) {
      console.warn('[email] RESEND_API_KEY is set but the Resend client is not yet wired (feature/email-pipeline). Falling back to console.');
    }
    console.log('[email] (stub — token values redacted; not a real send)');
    console.log(`  to: ${to}`);
    console.log(`  subject: ${subject}`);
    console.log(`  body: ${redactTokens(body)}`);
  }
}
