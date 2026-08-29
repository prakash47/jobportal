import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { ResendClient } from './resend-client';
import { renderTemplate, type TemplateKind, type TemplatePayload } from './templates';

const KILLSWITCH_FLAG = 'killswitch.transactional_emails';

// SRS §4.13 — discriminated union over the 8 template kinds. Each variant
// carries the data the template needs and a `userId` (or null for unknown-
// recipient flows like password-reset where the user is intentionally
// looked up by the unauthenticated endpoint and the row may not exist).
// `userId` is what we use to look up email preferences; null means
// "transactional-mandatory, no preference gating".
export type TransactionalEmailJob =
  | {
      kind: 'registration_confirmation';
      to: string;
      userId: number | null;
      payload: TemplatePayload<'registration_confirmation'>;
    }
  | {
      kind: 'email_verification';
      to: string;
      userId: number | null;
      payload: TemplatePayload<'email_verification'>;
    }
  | {
      kind: 'password_reset';
      to: string;
      userId: number | null;
      payload: TemplatePayload<'password_reset'>;
    }
  | {
      kind: 'signup_otp';
      to: string;
      userId: number | null;
      payload: TemplatePayload<'signup_otp'>;
    }
  | {
      kind: 'application_submitted';
      to: string;
      userId: number | null;
      payload: TemplatePayload<'application_submitted'>;
    }
  | {
      kind: 'application_status_change';
      to: string;
      userId: number | null;
      payload: TemplatePayload<'application_status_change'>;
    }
  | {
      kind: 'job_posted_confirmation';
      to: string;
      userId: number | null;
      payload: TemplatePayload<'job_posted_confirmation'>;
    }
  | {
      kind: 'payment_receipt';
      to: string;
      userId: number | null;
      payload: TemplatePayload<'payment_receipt'>;
    }
  | {
      kind: 'recruiter_invite';
      to: string;
      userId: number | null;
      payload: TemplatePayload<'recruiter_invite'>;
    }
  | {
      kind: 'admin_staff_invite';
      to: string;
      userId: number | null;
      payload: TemplatePayload<'admin_staff_invite'>;
    }
  | {
      kind: 'support_contact_message';
      to: string;
      userId: number | null;
      payload: TemplatePayload<'support_contact_message'>;
    }
  | {
      kind: 'support_ticket_opened';
      to: string;
      userId: number | null;
      payload: TemplatePayload<'support_ticket_opened'>;
    };

// Which user-preference toggle (if any) gates each template. null means the
// email is transactional-mandatory and bypasses preferences entirely (a user
// cannot opt out of password resets, identity verification, or receipts —
// CAN-SPAM exempts those from unsubscribe requirements anyway).
const PREFERENCE_GATE: Record<TemplateKind, keyof PrefRow | null> = {
  registration_confirmation: null,
  email_verification: null,
  password_reset: null,
  // Not gated, and cannot be: no User row exists yet, so there is no
  // preference row to read — and identity verification is exempt anyway.
  signup_otp: null,
  application_submitted: 'applicationStatusEnabled',
  application_status_change: 'applicationStatusEnabled',
  job_posted_confirmation: null,
  payment_receipt: null,
  // Team invitation is a direct, one-off action email (like a password reset) —
  // transactional-mandatory, no preference gating. The invitee has no account /
  // preference row yet anyway (userId is null at enqueue time).
  recruiter_invite: null,
  // Platform-staff invitation. Transactional-mandatory for the same reason as
  // the recruiter one above, and more strongly: the invitee has no account, no
  // preference row, and no other way to reach the portal at all.
  admin_staff_invite: null,
  // Help & Support ops-inbox mail. Recipient is the internal support inbox, not
  // a user — transactional-mandatory, never preference-gated (userId is null at
  // enqueue time).
  support_contact_message: null,
  support_ticket_opened: null,
};

interface PrefRow {
  jobAlertsEnabled: boolean;
  applicationStatusEnabled: boolean;
  productNewsEnabled: boolean;
}

@Injectable()
export class TransactionalEmailProcessor {
  private readonly logger = new Logger(TransactionalEmailProcessor.name);

  constructor(private readonly resend: ResendClient) {}

  async handle(job: TransactionalEmailJob): Promise<void> {
    // Layer 3 — the trust boundary. Even if a flag-bypassing caller somehow
    // enqueues, the worker will not actually send while the killswitch is
    // ON. Job ack's normally so it does not pile up retries against a
    // condition that won't change at the queue level.
    if (await isFlagEnabled(KILLSWITCH_FLAG)) {
      this.logger.log(
        `killswitch ON — skipping ${job.kind} send to ${job.to}`,
      );
      return;
    }

    const gate = PREFERENCE_GATE[job.kind];
    if (gate && job.userId !== null) {
      const allowed = await this.respectsPreference(job.userId, gate);
      if (!allowed) {
        this.logger.log(
          `user ${job.userId} disabled ${gate} — skipping ${job.kind}`,
        );
        return;
      }
    }

    const rendered = renderTemplate(job.kind, job.payload);
    await this.resend.send({
      to: job.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  }

  // Lazily provisioned: a user with no preference row is treated as having
  // all defaults from the schema (jobAlerts ON, applicationStatus ON,
  // productNews OFF). We don't insert here — the /settings/notifications
  // endpoints handle row creation on first PATCH. Keeping this read-only
  // means a reasonable burst of emails from the queue won't hammer the DB
  // with redundant inserts.
  private async respectsPreference(
    userId: number,
    field: keyof PrefRow,
  ): Promise<boolean> {
    const row = await prisma.emailPreference.findUnique({
      where: { userId },
      select: {
        jobAlertsEnabled: true,
        applicationStatusEnabled: true,
        productNewsEnabled: true,
      },
    });
    if (!row) {
      // Defaults from schema — applicationStatusEnabled defaults true so
      // the only category that defaults OFF is productNews, which is fine
      // because no template is gated on it yet.
      const defaults: PrefRow = {
        jobAlertsEnabled: true,
        applicationStatusEnabled: true,
        productNewsEnabled: false,
      };
      return defaults[field];
    }
    return row[field];
  }
}
