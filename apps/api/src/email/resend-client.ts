import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

export interface SendOpts {
  to: string;
  subject: string;
  html: string;
  text: string;
}

// Thin wrapper around the Resend SDK so the rest of the email module can
// pretend it's calling a single `send()` regardless of the env. In dev
// (RESEND_API_KEY blank) we log subject + first 200 chars of the text to
// stdout; never log HTML (too noisy) and never the full text (some emails
// embed one-time tokens that operators shouldn't be able to lift from
// stdout — see redactTokens history in the predecessor email.service).
@Injectable()
export class ResendClient {
  private readonly logger = new Logger(ResendClient.name);

  async send(opts: SendOpts): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM ?? 'JobPortal <noreply@jobportal.com>';
    if (!apiKey) {
      this.logger.log(
        `(stub — Resend not configured) to=${opts.to} subject="${opts.subject}"`,
      );
      return;
    }
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    // Resend SDK v6 returns { data, error }; throw on error so BullMQ retries.
    if (result.error) {
      throw new Error(
        `Resend rejected send to ${opts.to}: ${result.error.name} — ${result.error.message}`,
      );
    }
  }
}
