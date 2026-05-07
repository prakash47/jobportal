import { describe, expect, it } from 'vitest';
import { buildAlertEmail, type AlertEmailJob } from './email-template';

const sampleJob: AlertEmailJob = {
  title: 'Senior Engineer',
  companyName: 'Acme',
  canonicalSlug: 'senior-engineer-acme-12345',
  primaryCity: 'Bangalore',
  salary: '₹30 L – ₹50 L',
};

const baseInput = {
  alertName: 'React Bangalore',
  jobs: [sampleJob],
  manageAlertsUrl: 'https://www.jobportal.com/alerts',
  unsubscribeUrl: 'https://www.jobportal.com/alerts/unsubscribe/abc123',
  jobUrlPrefix: 'https://www.jobportal.com/job',
  searchUrl: 'https://www.jobportal.com/jobs?q=react',
};

describe('buildAlertEmail', () => {
  it('subject pluralises by count', () => {
    expect(buildAlertEmail({ ...baseInput, jobs: [sampleJob] }).subject).toBe(
      '1 new match for "React Bangalore"',
    );
    expect(buildAlertEmail({ ...baseInput, jobs: [sampleJob, sampleJob] }).subject).toBe(
      '2 new matches for "React Bangalore"',
    );
  });

  it('html includes the job title, manage link, and unsubscribe link', () => {
    const out = buildAlertEmail(baseInput);
    expect(out.html).toContain('Senior Engineer');
    expect(out.html).toContain('https://www.jobportal.com/job/senior-engineer-acme-12345');
    expect(out.html).toContain('https://www.jobportal.com/alerts/unsubscribe/abc123');
    expect(out.html).toContain('Manage your alerts');
    expect(out.html).toContain('Unsubscribe from this alert');
  });

  it('escapes HTML in alert name and job fields', () => {
    const out = buildAlertEmail({
      ...baseInput,
      alertName: 'X & <script>',
      jobs: [{ ...sampleJob, title: 'A "quoted" role' }],
    });
    expect(out.html).not.toContain('<script>');
    expect(out.html).toContain('X &amp; &lt;script&gt;');
    expect(out.html).toContain('A &quot;quoted&quot; role');
  });

  it('renders text fallback with one line per job + URLs', () => {
    const out = buildAlertEmail(baseInput);
    expect(out.text).toContain('Senior Engineer');
    expect(out.text).toContain('https://www.jobportal.com/job/senior-engineer-acme-12345');
    expect(out.text).toContain('Manage your alerts:');
    expect(out.text).toContain('Unsubscribe from this alert:');
  });

  it('handles a job with no city or salary gracefully', () => {
    const out = buildAlertEmail({
      ...baseInput,
      jobs: [{ ...sampleJob, primaryCity: null, salary: null }],
    });
    expect(out.html).toContain('Acme');
  });

  it('does NOT include marketing surface (no images, no gradients)', () => {
    const out = buildAlertEmail(baseInput);
    expect(out.html).not.toContain('<img');
    expect(out.html).not.toContain('linear-gradient');
    expect(out.html).not.toContain('<style');
  });
});
