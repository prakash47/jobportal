import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/feature-flags', () => ({ isFlagEnabled: vi.fn() }));
vi.mock('@jobportal/db', () => ({
  prisma: {
    recruiter: { findUnique: vi.fn() },
    supportTicket: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    supportTicketMessage: { create: vi.fn() },
    supportContactMessage: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { RecruiterSupportService } from './recruiter-support.service';

type Mock = ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
  recruiter: { findUnique: Mock };
  supportTicket: { create: Mock; findUnique: Mock; update: Mock };
  supportTicketMessage: { create: Mock };
  supportContactMessage: { create: Mock };
  $transaction: Mock;
};
const flag = isFlagEnabled as Mock;

const email = {
  enqueueSupportTicketOpened: vi.fn(),
  enqueueSupportContactMessage: vi.fn(),
};

const CALLER = {
  id: 1,
  companyId: 100,
  deactivatedAt: null,
  user: { name: 'Priya', email: 'priya@acme.com' },
  company: { name: 'Acme' },
};

describe('RecruiterSupportService', () => {
  let service: RecruiterSupportService;
  const savedInbox = process.env.SUPPORT_INBOX_EMAIL;

  beforeEach(() => {
    vi.resetAllMocks();
    flag.mockResolvedValue(false);
    db.$transaction.mockImplementation(
      async (fn: (tx: typeof prisma) => unknown) => fn(prisma),
    );
    db.recruiter.findUnique.mockResolvedValue(CALLER);
    email.enqueueSupportTicketOpened.mockResolvedValue(undefined);
    email.enqueueSupportContactMessage.mockResolvedValue(undefined);
    process.env.SUPPORT_INBOX_EMAIL = 'support@jobportal.com';
    service = new RecruiterSupportService(email as unknown as never);
  });

  afterEach(() => {
    if (savedInbox === undefined) delete process.env.SUPPORT_INBOX_EMAIL;
    else process.env.SUPPORT_INBOX_EMAIL = savedInbox;
  });

  // --- killswitch (L3) -----------------------------------------------------

  describe('killswitch ON', () => {
    beforeEach(() => flag.mockResolvedValue(true));

    it('createTicket rejects with 503 and writes nothing', async () => {
      await expect(
        service.createTicket(5, { subject: 'Help me', description: 'Long enough', category: 'OTHER' }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(db.supportTicket.create).not.toHaveBeenCalled();
    });

    it('reply rejects with 503', async () => {
      await expect(service.reply(5, 1, { body: 'hi' })).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(db.supportTicketMessage.create).not.toHaveBeenCalled();
    });

    it('close rejects with 503', async () => {
      await expect(service.close(5, 1)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(db.supportTicket.update).not.toHaveBeenCalled();
    });

    it('submitContact rejects with 503', async () => {
      await expect(
        service.submitContact(5, { name: 'Ravi', email: 'r@a.com', subject: 'Hey', message: 'Long enough' }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(db.supportContactMessage.create).not.toHaveBeenCalled();
    });
  });

  // --- getCaller guards ----------------------------------------------------

  it('createTicket 404s when the caller has no recruiter row', async () => {
    db.recruiter.findUnique.mockResolvedValue(null);
    await expect(
      service.createTicket(5, { subject: 'Help me', description: 'Long enough', category: 'OTHER' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('createTicket 403s when the caller is deactivated', async () => {
    db.recruiter.findUnique.mockResolvedValue({ ...CALLER, deactivatedAt: new Date() });
    await expect(
      service.createTicket(5, { subject: 'Help me', description: 'Long enough', category: 'OTHER' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // --- createTicket --------------------------------------------------------

  describe('createTicket', () => {
    const input = { subject: 'Cannot publish', description: 'The button does nothing.', category: 'JOB_POSTING' as const };
    const created = { id: 7, subject: input.subject, category: input.category, status: 'OPEN', createdAt: new Date() };

    it('creates the ticket scoped to the caller company and returns it', async () => {
      db.supportTicket.create.mockResolvedValue(created);
      const res = await service.createTicket(42, input);
      expect(db.supportTicket.create).toHaveBeenCalledOnce();
      const data = db.supportTicket.create.mock.calls[0]?.[0].data;
      expect(data).toMatchObject({ userId: 42, companyId: 100, subject: input.subject, category: 'JOB_POSTING' });
      expect(res).toEqual(created);
    });

    it('forwards the ops-inbox email when SUPPORT_INBOX_EMAIL is set', async () => {
      db.supportTicket.create.mockResolvedValue(created);
      await service.createTicket(42, input);
      expect(email.enqueueSupportTicketOpened).toHaveBeenCalledOnce();
      const [to, payload] = email.enqueueSupportTicketOpened.mock.calls[0] ?? [];
      expect(to).toBe('support@jobportal.com');
      expect(payload).toMatchObject({ ticketId: 7, companyName: 'Acme', recruiterEmail: 'priya@acme.com' });
    });

    it('does NOT enqueue when SUPPORT_INBOX_EMAIL is blank', async () => {
      process.env.SUPPORT_INBOX_EMAIL = '';
      db.supportTicket.create.mockResolvedValue(created);
      await service.createTicket(42, input);
      expect(email.enqueueSupportTicketOpened).not.toHaveBeenCalled();
    });

    it('still succeeds when the ops-inbox enqueue rejects (fire-and-log)', async () => {
      db.supportTicket.create.mockResolvedValue(created);
      email.enqueueSupportTicketOpened.mockRejectedValue(new Error('redis down'));
      await expect(service.createTicket(42, input)).resolves.toEqual(created);
    });
  });

  // --- reply ---------------------------------------------------------------

  describe('reply', () => {
    const msg = { id: 11, body: 'here is more info', fromSupport: false, createdAt: new Date() };

    it('404s when the ticket belongs to another user (indistinguishable)', async () => {
      db.supportTicket.findUnique.mockResolvedValue({ id: 1, userId: 999, status: 'OPEN' });
      await expect(service.reply(42, 1, { body: 'hi' })).rejects.toBeInstanceOf(NotFoundException);
      expect(db.supportTicketMessage.create).not.toHaveBeenCalled();
    });

    it('404s when the ticket is missing', async () => {
      db.supportTicket.findUnique.mockResolvedValue(null);
      await expect(service.reply(42, 1, { body: 'hi' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('409s on a CLOSED ticket', async () => {
      db.supportTicket.findUnique.mockResolvedValue({ id: 1, userId: 42, status: 'CLOSED' });
      await expect(service.reply(42, 1, { body: 'hi' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('reopens a RESOLVED ticket to IN_PROGRESS and clears resolvedAt', async () => {
      db.supportTicket.findUnique.mockResolvedValue({ id: 1, userId: 42, status: 'RESOLVED' });
      db.supportTicketMessage.create.mockResolvedValue(msg);
      db.supportTicket.update.mockResolvedValue({});
      const res = await service.reply(42, 1, { body: 'still broken' });
      expect(db.supportTicket.update).toHaveBeenCalledOnce();
      expect(db.supportTicket.update.mock.calls[0]?.[0].data).toEqual({ status: 'IN_PROGRESS', resolvedAt: null });
      expect(res.reopened).toBe(true);
    });

    it('does NOT change status when the ticket is OPEN', async () => {
      db.supportTicket.findUnique.mockResolvedValue({ id: 1, userId: 42, status: 'OPEN' });
      db.supportTicketMessage.create.mockResolvedValue(msg);
      const res = await service.reply(42, 1, { body: 'more' });
      expect(db.supportTicket.update).not.toHaveBeenCalled();
      expect(res.reopened).toBe(false);
    });

    it('does NOT change status when the ticket is IN_PROGRESS', async () => {
      db.supportTicket.findUnique.mockResolvedValue({ id: 1, userId: 42, status: 'IN_PROGRESS' });
      db.supportTicketMessage.create.mockResolvedValue(msg);
      await service.reply(42, 1, { body: 'more' });
      expect(db.supportTicket.update).not.toHaveBeenCalled();
    });
  });

  // --- close ---------------------------------------------------------------

  describe('close', () => {
    it('404s when the ticket is not owned', async () => {
      db.supportTicket.findUnique.mockResolvedValue({ id: 1, userId: 999, status: 'OPEN', closedAt: null });
      await expect(service.close(42, 1)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('is idempotent on an already-CLOSED ticket (no update)', async () => {
      const closedAt = new Date();
      db.supportTicket.findUnique.mockResolvedValue({ id: 1, userId: 42, status: 'CLOSED', closedAt });
      const res = await service.close(42, 1);
      expect(db.supportTicket.update).not.toHaveBeenCalled();
      expect(res).toEqual({ id: 1, status: 'CLOSED', closedAt });
    });

    it('closes an open ticket', async () => {
      db.supportTicket.findUnique.mockResolvedValue({ id: 1, userId: 42, status: 'OPEN', closedAt: null });
      db.supportTicket.update.mockResolvedValue({ id: 1, status: 'CLOSED', closedAt: new Date() });
      const res = await service.close(42, 1);
      expect(db.supportTicket.update).toHaveBeenCalledOnce();
      expect(db.supportTicket.update.mock.calls[0]?.[0].data.status).toBe('CLOSED');
      expect(res.status).toBe('CLOSED');
    });
  });

  // --- submitContact -------------------------------------------------------

  describe('submitContact', () => {
    const input = { name: 'Ravi', email: 'ravi@acme.com', subject: 'Applicants', message: 'How do I export?' };

    it('stores the message and returns its id', async () => {
      db.supportContactMessage.create.mockResolvedValue({ id: 3, ...input });
      const res = await service.submitContact(42, input);
      expect(db.supportContactMessage.create.mock.calls[0]?.[0].data).toMatchObject({ userId: 42, email: 'ravi@acme.com' });
      expect(res).toEqual({ id: 3 });
    });

    it('forwards the ops-inbox email fire-and-log (still succeeds on reject)', async () => {
      db.supportContactMessage.create.mockResolvedValue({ id: 3, ...input });
      email.enqueueSupportContactMessage.mockRejectedValue(new Error('redis down'));
      await expect(service.submitContact(42, input)).resolves.toEqual({ id: 3 });
      expect(email.enqueueSupportContactMessage).toHaveBeenCalledOnce();
    });

    it('does NOT enqueue when SUPPORT_INBOX_EMAIL is blank', async () => {
      process.env.SUPPORT_INBOX_EMAIL = '';
      db.supportContactMessage.create.mockResolvedValue({ id: 3, ...input });
      await service.submitContact(42, input);
      expect(email.enqueueSupportContactMessage).not.toHaveBeenCalled();
    });
  });
});
