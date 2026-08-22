import { Injectable } from '@nestjs/common';
import { ResendClient } from './resend-client';
import { TransactionalEmailQueueService } from './transactional-email.queue';
import type {
  ApplicationStatusChangePayload,
  ApplicationSubmittedPayload,
  EmailVerificationPayload,
  JobPostedConfirmationPayload,
  PasswordResetPayload,
  PaymentReceiptPayload,
  RecruiterInvitePayload,
  AdminStaffInvitePayload,
  RegistrationConfirmationPayload,
  SupportContactMessagePayload,
  SupportTicketOpenedPayload,
} from './templates';

// SRS §4.13 — public producer API. Every transactional email goes through a
// queue (enqueue* methods) so a Resend hiccup retries automatically rather
// than 5xx-ing the user request. The one exception is sendJobAlert, which
// is already invoked from inside a BullMQ worker (the alert digest worker)
// — wrapping it in another queue would just be a wasted Redis hop.
@Injectable()
export class EmailService {
  constructor(
    private readonly queue: TransactionalEmailQueueService,
    private readonly resend: ResendClient,
  ) {}

  enqueueRegistrationConfirmation(
    to: string,
    userId: number | null,
    payload: RegistrationConfirmationPayload,
  ): Promise<void> {
    return this.queue.enqueue({
      kind: 'registration_confirmation',
      to,
      userId,
      payload,
    });
  }

  enqueueEmailVerification(
    to: string,
    userId: number | null,
    payload: EmailVerificationPayload,
  ): Promise<void> {
    return this.queue.enqueue({
      kind: 'email_verification',
      to,
      userId,
      payload,
    });
  }

  enqueuePasswordReset(
    to: string,
    userId: number | null,
    payload: PasswordResetPayload,
  ): Promise<void> {
    return this.queue.enqueue({
      kind: 'password_reset',
      to,
      userId,
      payload,
    });
  }

  enqueueApplicationSubmitted(
    to: string,
    userId: number | null,
    payload: ApplicationSubmittedPayload,
  ): Promise<void> {
    return this.queue.enqueue({
      kind: 'application_submitted',
      to,
      userId,
      payload,
    });
  }

  enqueueApplicationStatusChange(
    to: string,
    userId: number | null,
    payload: ApplicationStatusChangePayload,
  ): Promise<void> {
    return this.queue.enqueue({
      kind: 'application_status_change',
      to,
      userId,
      payload,
    });
  }

  enqueueJobPostedConfirmation(
    to: string,
    userId: number | null,
    payload: JobPostedConfirmationPayload,
  ): Promise<void> {
    return this.queue.enqueue({
      kind: 'job_posted_confirmation',
      to,
      userId,
      payload,
    });
  }

  enqueuePaymentReceipt(
    to: string,
    userId: number | null,
    payload: PaymentReceiptPayload,
  ): Promise<void> {
    return this.queue.enqueue({
      kind: 'payment_receipt',
      to,
      userId,
      payload,
    });
  }

  // SRS §4.9 — recruiter Team invitation. userId is null (the invitee has no
  // account yet); the email is transactional-mandatory (no preference gating).
  enqueueRecruiterInvite(
    to: string,
    userId: number | null,
    payload: RecruiterInvitePayload,
  ): Promise<void> {
    return this.queue.enqueue({
      kind: 'recruiter_invite',
      to,
      userId,
      payload,
    });
  }

  // SRS §4.16 — platform-staff invitation to the /sadmin portal. userId is null
  // (the invitee has no account yet); the email is transactional-mandatory (no
  // preference gating).
  //
  // ⚠ A resolved promise here is NOT proof of delivery: the queue log-and-drops
  // when Redis is unreachable. Callers must treat the invite as pending and
  // offer a resend rather than reporting "sent".
  enqueueAdminStaffInvite(
    to: string,
    userId: number | null,
    payload: AdminStaffInvitePayload,
  ): Promise<void> {
    return this.queue.enqueue({
      kind: 'admin_staff_invite',
      to,
      userId,
      payload,
    });
  }

  // Help & Support — Contact Us submission forwarded to the ops inbox. userId
  // is null (recipient is the internal support inbox, not a user account); the
  // email is transactional-mandatory (no preference gating).
  enqueueSupportContactMessage(
    to: string,
    payload: SupportContactMessagePayload,
  ): Promise<void> {
    return this.queue.enqueue({
      kind: 'support_contact_message',
      to,
      userId: null,
      payload,
    });
  }

  // Help & Support — a newly raised support ticket forwarded to the ops inbox.
  // userId is null (recipient is the internal support inbox); transactional-
  // mandatory.
  enqueueSupportTicketOpened(
    to: string,
    payload: SupportTicketOpenedPayload,
  ): Promise<void> {
    return this.queue.enqueue({
      kind: 'support_ticket_opened',
      to,
      userId: null,
      payload,
    });
  }

  // SRS §4.5.3 — direct-send carve-out. The alert digest worker is itself a
  // BullMQ job; double-queueing for retries would make traceability worse
  // and slow the worker down. If this throws, the caller's `failed` listener
  // logs and BullMQ retries the digest job per its own attempt config.
  async sendJobAlert(
    to: string,
    payload: { subject: string; html: string; text: string },
  ): Promise<void> {
    await this.resend.send({
      to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });
  }
}
