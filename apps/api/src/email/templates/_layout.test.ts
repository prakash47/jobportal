import { describe, expect, it } from 'vitest';
import { esc, renderLayout } from './_layout';
import { renderTemplate, type TemplateKind } from './index';

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

const ALL_KINDS: TemplateKind[] = [
  'registration_confirmation',
  'email_verification',
  'password_reset',
  'application_submitted',
  'application_status_change',
  'job_posted_confirmation',
  'payment_receipt',
];

const fixtures = {
  registration_confirmation: { name: 'Aisha' },
  email_verification: { verifyUrl: 'https://jobportal.com/verify?token=t' },
  password_reset: {
    resetUrl: 'https://jobportal.com/reset?token=t',
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
} as const;

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
