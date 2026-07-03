import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    emailPreference: { findUnique: vi.fn() },
  },
}));
vi.mock('@jobportal/feature-flags', () => ({
  isFlagEnabled: vi.fn(),
}));

import { prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { ResendClient } from './resend-client';
import { TransactionalEmailProcessor } from './transactional-email.processor';

const mockedPrisma = prisma as unknown as {
  emailPreference: { findUnique: ReturnType<typeof vi.fn> };
};
const mockedFlag = isFlagEnabled as unknown as ReturnType<typeof vi.fn>;

describe('TransactionalEmailProcessor.handle', () => {
  let proc: TransactionalEmailProcessor;
  let resend: { send: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.resetAllMocks();
    mockedFlag.mockResolvedValue(false);
    resend = { send: vi.fn().mockResolvedValue(undefined) };
    proc = new TransactionalEmailProcessor(resend as unknown as ResendClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('killswitch ON → no Resend call (job acks normally)', async () => {
    mockedFlag.mockImplementation(async (key: string) =>
      key === 'killswitch.transactional_emails',
    );
    await proc.handle({
      kind: 'password_reset',
      to: 'a@b.com',
      userId: 1,
      payload: { resetUrl: 'https://x', expiresInMinutes: 15 },
    });
    expect(resend.send).not.toHaveBeenCalled();
  });

  it('mandatory category (password_reset) sends regardless of preference', async () => {
    mockedPrisma.emailPreference.findUnique.mockResolvedValue({
      jobAlertsEnabled: false,
      applicationStatusEnabled: false,
      productNewsEnabled: false,
    });
    await proc.handle({
      kind: 'password_reset',
      to: 'a@b.com',
      userId: 1,
      payload: { resetUrl: 'https://x', expiresInMinutes: 15 },
    });
    // Mandatory categories don't even read the preference row.
    expect(mockedPrisma.emailPreference.findUnique).not.toHaveBeenCalled();
    expect(resend.send).toHaveBeenCalledOnce();
  });

  it('application_status_change skips when applicationStatusEnabled=false', async () => {
    mockedPrisma.emailPreference.findUnique.mockResolvedValue({
      jobAlertsEnabled: true,
      applicationStatusEnabled: false,
      productNewsEnabled: true,
    });
    await proc.handle({
      kind: 'application_status_change',
      to: 'a@b.com',
      userId: 42,
      payload: {
        jobTitle: 'Sales',
        companyName: 'Acme',
        from: 'APPLIED',
        to: 'IN_REVIEW',
        applicationUrl: 'https://x/apps/1',
      },
    });
    expect(resend.send).not.toHaveBeenCalled();
  });

  it('application_status_change sends when preference row missing (defaults)', async () => {
    mockedPrisma.emailPreference.findUnique.mockResolvedValue(null);
    await proc.handle({
      kind: 'application_status_change',
      to: 'a@b.com',
      userId: 42,
      payload: {
        jobTitle: 'Sales',
        companyName: 'Acme',
        from: 'APPLIED',
        to: 'IN_REVIEW',
        applicationUrl: 'https://x/apps/1',
      },
    });
    expect(resend.send).toHaveBeenCalledOnce();
  });

  it('application_submitted skips when applicationStatusEnabled=false', async () => {
    mockedPrisma.emailPreference.findUnique.mockResolvedValue({
      jobAlertsEnabled: true,
      applicationStatusEnabled: false,
      productNewsEnabled: true,
    });
    await proc.handle({
      kind: 'application_submitted',
      to: 'a@b.com',
      userId: 42,
      payload: {
        jobTitle: 'Sales',
        companyName: 'Acme',
        applicationUrl: 'https://x/apps/1',
      },
    });
    expect(resend.send).not.toHaveBeenCalled();
  });

  it('rendered HTML reaches the Resend client with subject + text + html', async () => {
    await proc.handle({
      kind: 'email_verification',
      to: 'verify@example.com',
      userId: null,
      payload: { verifyUrl: 'https://jobportal.com/verify?token=abc' },
    });
    expect(resend.send).toHaveBeenCalledOnce();
    const call = resend.send.mock.calls[0]?.[0] as {
      to: string;
      subject: string;
      html: string;
      text: string;
    };
    expect(call.to).toBe('verify@example.com');
    expect(call.subject).toMatch(/verify/i);
    expect(call.html).toContain('Verify');
    expect(call.html).toContain('https://jobportal.com/verify?token=abc');
    expect(call.text).toContain('https://jobportal.com/verify?token=abc');
  });

  it('support_ticket_opened is mandatory (no preference lookup) and renders to Resend', async () => {
    await proc.handle({
      kind: 'support_ticket_opened',
      to: 'support@jobportal.com',
      userId: null,
      payload: {
        ticketId: 7,
        subject: 'Cannot publish a job',
        category: 'JOB_POSTING',
        companyName: 'Acme',
        recruiterName: 'Priya Sharma',
        recruiterEmail: 'priya@acme.com',
        description: 'The publish button does nothing.',
      },
    });
    expect(mockedPrisma.emailPreference.findUnique).not.toHaveBeenCalled();
    const call = resend.send.mock.calls[0]?.[0] as { subject: string; html: string };
    expect(call.subject).toContain('[Ticket #7]');
    expect(call.html).toContain('Acme');
  });

  it('support_contact_message is mandatory (no preference lookup) and renders to Resend', async () => {
    await proc.handle({
      kind: 'support_contact_message',
      to: 'support@jobportal.com',
      userId: null,
      payload: {
        contactId: 3,
        name: 'Ravi Kumar',
        email: 'ravi@acme.com',
        subject: 'Question about applicants',
        message: 'How do I export the list?',
      },
    });
    expect(mockedPrisma.emailPreference.findUnique).not.toHaveBeenCalled();
    const call = resend.send.mock.calls[0]?.[0] as { subject: string; html: string };
    expect(call.subject).toContain('[Contact]');
    expect(call.html).toContain('ravi@acme.com');
  });

  it('userId=null bypasses preference lookup even for gated categories', async () => {
    // E.g. an admin-triggered application_submitted email where the
    // recipient hasn't been resolved to a user row. Defaults would let it
    // through anyway, but we should not be hammering the DB on a null key.
    await proc.handle({
      kind: 'application_submitted',
      to: 'a@b.com',
      userId: null,
      payload: {
        jobTitle: 'Sales',
        companyName: 'Acme',
        applicationUrl: 'https://x/apps/1',
      },
    });
    expect(mockedPrisma.emailPreference.findUnique).not.toHaveBeenCalled();
    expect(resend.send).toHaveBeenCalledOnce();
  });
});
