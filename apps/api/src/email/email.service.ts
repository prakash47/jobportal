import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

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

  // SRS §4.6.3 — application-status change notifications. Real send wires up
  // in feature/email-pipeline (Task 18) which adds Resend + BullMQ batching.
  // For now we log; the call sites in applications.service still fire so the
  // observable contract is correct.
  async sendApplicationStatusChange(
    toEmail: string,
    opts: { jobTitle: string; companyName: string; from: string; to: string },
  ): Promise<void> {
    const subject = `Update on your application for ${opts.jobTitle}`;
    const body =
      `Your application for "${opts.jobTitle}" at ${opts.companyName} has moved ` +
      `from ${opts.from} to ${opts.to}.`;
    await this.send(toEmail, subject, body);
  }

  // SRS §4.5.3 — job-alert email. Sends via Resend when RESEND_API_KEY is
  // set; logs the rendered subject + plain text otherwise so dev runs work
  // without a configured Resend account. The HTML body never goes to logs
  // (too large + already mirrored in the text part).
  async sendJobAlert(
    toEmail: string,
    payload: { subject: string; html: string; text: string },
  ): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM ?? 'JobPortal <alerts@jobportal.com>';
    if (!apiKey) {
      console.log('[email] (stub — Resend not configured; not a real send)');
      console.log(`  to: ${toEmail}`);
      console.log(`  subject: ${payload.subject}`);
      console.log(`  text: ${payload.text}`);
      return;
    }
    const resend = new Resend(apiKey);
    try {
      await resend.emails.send({
        from,
        to: toEmail,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      });
    } catch (err: unknown) {
      const log = new Logger(EmailService.name);
      log.error(`Resend send failed for ${toEmail}: ${(err as Error).message}`);
      throw err;
    }
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
