// SRS §4.13 — central registry for the seven transactional templates.
// Each template exports a render function returning {subject, html, text}.
// Adding a new template = (1) drop a file here, (2) add the kind to the
// TemplateMap below, (3) add the discriminated-union variant in
// transactional-email.processor.ts, (4) decide whether it gates on a user
// preference. The compiler then refuses to leave any of those holes empty.

import type { Rendered } from './_layout';
import { renderRegistrationConfirmation } from './registration-confirmation';
import { renderEmailVerification } from './email-verification';
import { renderPasswordReset } from './password-reset';
import { renderApplicationSubmitted } from './application-submitted';
import { renderApplicationStatusChange } from './application-status-change';
import { renderJobPostedConfirmation } from './job-posted-confirmation';
import { renderPaymentReceipt } from './payment-receipt';

export type { Rendered };

export interface RegistrationConfirmationPayload {
  name: string;
}
export interface EmailVerificationPayload {
  verifyUrl: string;
}
export interface PasswordResetPayload {
  resetUrl: string;
  expiresInMinutes: number;
}
export interface ApplicationSubmittedPayload {
  jobTitle: string;
  companyName: string;
  applicationUrl: string;
}
export interface ApplicationStatusChangePayload {
  jobTitle: string;
  companyName: string;
  from: string;
  to: string;
  applicationUrl: string;
}
export interface JobPostedConfirmationPayload {
  jobTitle: string;
  jobUrl: string;
  applicantsUrl: string;
}
export interface PaymentReceiptPayload {
  invoiceNumber: string;
  amountInr: string;
  invoiceUrl: string;
  planName: string;
}

export interface TemplateMap {
  registration_confirmation: RegistrationConfirmationPayload;
  email_verification: EmailVerificationPayload;
  password_reset: PasswordResetPayload;
  application_submitted: ApplicationSubmittedPayload;
  application_status_change: ApplicationStatusChangePayload;
  job_posted_confirmation: JobPostedConfirmationPayload;
  payment_receipt: PaymentReceiptPayload;
}

export type TemplateKind = keyof TemplateMap;
export type TemplatePayload<K extends TemplateKind> = TemplateMap[K];

export function renderTemplate<K extends TemplateKind>(
  kind: K,
  payload: TemplatePayload<K>,
): Rendered {
  switch (kind) {
    case 'registration_confirmation':
      return renderRegistrationConfirmation(
        payload as RegistrationConfirmationPayload,
      );
    case 'email_verification':
      return renderEmailVerification(payload as EmailVerificationPayload);
    case 'password_reset':
      return renderPasswordReset(payload as PasswordResetPayload);
    case 'application_submitted':
      return renderApplicationSubmitted(payload as ApplicationSubmittedPayload);
    case 'application_status_change':
      return renderApplicationStatusChange(
        payload as ApplicationStatusChangePayload,
      );
    case 'job_posted_confirmation':
      return renderJobPostedConfirmation(
        payload as JobPostedConfirmationPayload,
      );
    case 'payment_receipt':
      return renderPaymentReceipt(payload as PaymentReceiptPayload);
    default: {
      const _exhaustive: never = kind;
      throw new Error(`unknown template kind: ${String(_exhaustive)}`);
    }
  }
}
