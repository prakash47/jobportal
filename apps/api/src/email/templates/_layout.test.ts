import { describe, expect, it } from 'vitest';
import { esc, renderLayout } from './_layout';
import { renderTemplate, type TemplateKind, type TemplatePayload } from './index';

describe('email layout', () => {
  it('escapes user-controlled HTML', () => {
    expect(esc('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
  });

  it('always includes Manage notification preferences + Unsubscribe links', () => {
    const out = renderLayout('Hello', {
      preheader: 'preview',
      heading: 'Hello',
      bodyParagraphs: ['Body line.'],
      text: 'Hello\n\nBody line.',
    });
    expect(out.html).toContain('Manage notification preferences');
    expect(out.html).toContain('Unsubscribe');
    expect(out.text).toContain('Manage notification preferences');
    expect(out.text).toContain('Unsubscribe');
  });

  it('omits CTA block when no cta passed', () => {
    const out = renderLayout('No-CTA', {
      preheader: 'p',
      heading: 'h',
      bodyParagraphs: ['b'],
      text: 't',
    });
    // Heuristic: an action button uses the primary color background.
    expect(out.html).not.toContain('background:#2557d6');
  });

  it('renders a single CTA when provided', () => {
    const out = renderLayout('CTA', {
      preheader: 'p',
      heading: 'h',
      bodyParagraphs: ['b'],
      cta: { label: 'Click', url: 'https://example.com/' },
      text: 't',
    });
    expect(out.html).toContain('background:#2557d6');
    expect(out.html).toContain('href="https://example.com/"');
    expect(out.html).toContain('Click');
  });
});



// Exhaustive by TYPE: `Record<TemplateKind, ...>` makes `tsc` reject a missing
// kind, so a new template cannot be added without a fixture.
const fixtures: { [K in TemplateKind]: TemplatePayload<K> } = {
  registration_confirmation: { name: 'Aisha' },
  email_verification: { verifyUrl: 'https://jobportal.com/verify?token=t' },
  password_reset: {
    code: '481920',
    expiresInMinutes: 15,
  },
  signup_otp: {
    code: '481920',
    name: 'Aisha',
    expiresInMinutes: 15,
  },
  application_submitted: {
    jobTitle: 'Sales Lead',
    companyName: 'Acme Corp',
    applicationUrl: 'https://jobportal.com/applications/1',
  },
  application_status_change: {
    jobTitle: 'Sales Lead',
    companyName: 'Acme Corp',
    from: 'APPLIED',
    to: 'IN_REVIEW',
    applicationUrl: 'https://jobportal.com/applications/1',
  },
  job_posted_confirmation: {
    jobTitle: 'Sales Lead',
    jobUrl: 'https://jobportal.com/job/sales-lead-1',
    applicantsUrl: 'https://recruit.jobportal.com/jobs/1/applicants',
  },
  payment_receipt: {
    invoiceNumber: 'INV-001',
    amountInr: '4,999',
    invoiceUrl: 'https://jobportal.com/billing/invoice/INV-001',
    planName: 'Premium',
  },
  recruiter_invite: {
    inviteUrl: 'https://recruit.jobportal.com/accept-invite/tok',
    companyName: 'Acme Corp',
    inviterName: 'Anjali',
    expiresInHours: 72,
  },
  admin_staff_invite: {
    inviteUrl: 'https://admin.jobportal.com/sadmin/accept-invite/tok',
    expiresInHours: 72,
  },
  support_contact_message: {
    contactId: 3,
    name: 'Ravi Kumar',
    email: 'ravi@acme.com',
    subject: 'Question about applicants',
    message: 'How do I export the applicant list?',
  },
  support_ticket_opened: {
    ticketId: 7,
    subject: 'Cannot publish a job',
    category: 'JOB_POSTING',
    companyName: 'Acme Corp',
    recruiterName: 'Priya Sharma',
    recruiterEmail: 'priya@acme.com',
    description: 'The publish button does nothing when I click it.',
  },
} as const;

// DERIVED, never hand-maintained. This was a literal array, and it had silently
// drifted three kinds behind `TemplateMap` — signup_otp, recruiter_invite and
// admin_staff_invite were rendered by NO test at all, which was proved by making
// renderSignupOtp throw unconditionally and watching all 1520 tests still pass.
// `TemplateKind[]` cannot catch that: a short list is a valid array. Deriving the
// list from the exhaustively-typed fixtures above makes the omission
// unrepresentable rather than merely discouraged.
const ALL_KINDS = Object.keys(fixtures) as TemplateKind[];

describe.each(ALL_KINDS)('renderTemplate(%s)', (kind) => {
  it('produces non-empty subject + html + text + footer', () => {
    const out = renderTemplate(
      kind,
      fixtures[kind] as never, // discriminated-union narrowing in test fixture map
    );
    expect(out.subject.length).toBeGreaterThan(0);
    expect(out.html).toContain('<!DOCTYPE html>');
    expect(out.text.length).toBeGreaterThan(0);
    // Per SRS §4.13.3 — every email has unsubscribe.
    expect(out.html).toContain('Unsubscribe');
    expect(out.text).toContain('Unsubscribe');
  });
});
