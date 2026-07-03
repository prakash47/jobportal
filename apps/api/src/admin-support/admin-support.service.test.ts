import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    supportTicket: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    supportTicketMessage: { create: vi.fn() },
    supportContactMessage: { count: vi.fn(), findMany: vi.fn() },
    profileAuditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  Prisma: {},
}));

import { prisma } from '@jobportal/db';
import { AdminSupportService } from './admin-support.service';

type Mock = ReturnType<typeof vi.fn>;
const m = prisma as unknown as {
  supportTicket: { count: Mock; findMany: Mock; findUnique: Mock; update: Mock };
  supportTicketMessage: { create: Mock };
  supportContactMessage: { count: Mock; findMany: Mock };
  profileAuditLog: { create: Mock };
  $transaction: Mock;
};

const notifications = { notifyTicketUpdate: vi.fn() };

describe('AdminSupportService', () => {
  let service: AdminSupportService;

  beforeEach(() => {
    vi.resetAllMocks();
    m.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
    m.profileAuditLog.create.mockResolvedValue({});
    m.supportTicket.update.mockResolvedValue({});
    m.supportTicketMessage.create.mockResolvedValue({ id: 9 });
    notifications.notifyTicketUpdate.mockResolvedValue(undefined);
    service = new AdminSupportService(notifications as unknown as never);
  });

  // --- listTickets ---------------------------------------------------------

  describe('listTickets', () => {
    beforeEach(() => {
      m.supportTicket.count.mockResolvedValue(1);
      m.supportTicket.findMany.mockResolvedValue([
        {
          id: 1,
          subject: 'Help',
          category: 'OTHER',
          status: 'OPEN',
          createdAt: new Date(),
          updatedAt: new Date(),
          user: { id: 5, name: 'Priya', email: 'p@a.com' },
          company: { id: 100, name: 'Acme' },
          _count: { messages: 3 },
        },
      ]);
    });

    it('defaults to all tickets (no status filter)', async () => {
      const res = await service.listTickets({});
      expect(m.supportTicket.findMany.mock.calls[0]?.[0].where).toEqual({});
      expect(res.items[0]?.messageCount).toBe(3);
      expect(res.totalPages).toBe(1);
    });

    it('filters by status when given', async () => {
      await service.listTickets({ status: 'RESOLVED' });
      expect(m.supportTicket.findMany.mock.calls[0]?.[0].where).toEqual({ status: 'RESOLVED' });
    });

    it('paginates with skip/take', async () => {
      m.supportTicket.count.mockResolvedValue(45);
      const res = await service.listTickets({ page: 2 });
      expect(m.supportTicket.findMany.mock.calls[0]?.[0].skip).toBe(20);
      expect(res.totalPages).toBe(3);
    });
  });

  // --- getTicketDetail -----------------------------------------------------

  it('getTicketDetail 404s when missing', async () => {
    m.supportTicket.findUnique.mockResolvedValue(null);
    await expect(service.getTicketDetail(1)).rejects.toBeInstanceOf(NotFoundException);
  });

  // --- updateStatus --------------------------------------------------------

  describe('updateStatus', () => {
    it('404s when the ticket is missing', async () => {
      m.supportTicket.findUnique.mockResolvedValue(null);
      await expect(service.updateStatus(1, 1, { status: 'RESOLVED' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('is a no-op when the status is unchanged (no tx, no audit, no notify)', async () => {
      m.supportTicket.findUnique.mockResolvedValue({ id: 1, userId: 5, subject: 'Help', status: 'OPEN' });
      await service.updateStatus(1, 1, { status: 'OPEN' });
      expect(m.$transaction).not.toHaveBeenCalled();
      expect(m.profileAuditLog.create).not.toHaveBeenCalled();
      expect(notifications.notifyTicketUpdate).not.toHaveBeenCalled();
    });

    it('writes an audit row with status before/after and no message bodies', async () => {
      m.supportTicket.findUnique.mockResolvedValue({ id: 1, userId: 5, subject: 'Help', status: 'OPEN' });
      await service.updateStatus(99, 1, { status: 'RESOLVED' });
      const audit = m.profileAuditLog.create.mock.calls[0]?.[0].data;
      expect(audit.userId).toBe(99);
      expect(audit.action).toBe('SUPPORT_TICKET_STATUS_CHANGED');
      expect(audit.diff).toEqual({ ticketId: 1, status: { before: 'OPEN', after: 'RESOLVED' } });
      expect(JSON.stringify(audit.diff)).not.toContain('Help');
    });

    it('sets resolvedAt when moving to RESOLVED and clears closedAt', async () => {
      m.supportTicket.findUnique.mockResolvedValue({ id: 1, userId: 5, subject: 'Help', status: 'OPEN' });
      await service.updateStatus(1, 1, { status: 'RESOLVED' });
      const data = m.supportTicket.update.mock.calls[0]?.[0].data;
      expect(data.status).toBe('RESOLVED');
      expect(data.resolvedAt).toBeInstanceOf(Date);
      expect(data.closedAt).toBeNull();
    });

    it('sets closedAt when moving to CLOSED', async () => {
      m.supportTicket.findUnique.mockResolvedValue({ id: 1, userId: 5, subject: 'Help', status: 'IN_PROGRESS' });
      await service.updateStatus(1, 1, { status: 'CLOSED' });
      const data = m.supportTicket.update.mock.calls[0]?.[0].data;
      expect(data.closedAt).toBeInstanceOf(Date);
      expect(data.resolvedAt).toBeNull();
    });

    it('fires the bell notification (kind status) and still succeeds when it rejects', async () => {
      m.supportTicket.findUnique.mockResolvedValue({ id: 1, userId: 5, subject: 'Help', status: 'OPEN' });
      notifications.notifyTicketUpdate.mockRejectedValue(new Error('down'));
      await expect(service.updateStatus(1, 1, { status: 'RESOLVED' })).resolves.toBeDefined();
      const arg = notifications.notifyTicketUpdate.mock.calls[0]?.[0];
      expect(arg).toMatchObject({ recruiterUserId: 5, ticketId: 1, kind: 'status', status: 'RESOLVED' });
    });
  });

  // --- staffReply ----------------------------------------------------------

  describe('staffReply', () => {
    it('404s when missing', async () => {
      m.supportTicket.findUnique.mockResolvedValue(null);
      await expect(service.staffReply(1, 1, { body: 'hi' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('409s on a CLOSED ticket', async () => {
      m.supportTicket.findUnique.mockResolvedValue({ id: 1, userId: 5, subject: 'Help', status: 'CLOSED' });
      await expect(service.staffReply(1, 1, { body: 'hi' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('flips an OPEN ticket to IN_PROGRESS on first staff reply', async () => {
      m.supportTicket.findUnique.mockResolvedValue({ id: 1, userId: 5, subject: 'Help', status: 'OPEN' });
      await service.staffReply(7, 1, { body: 'looking into it' });
      expect(m.supportTicketMessage.create.mock.calls[0]?.[0].data).toMatchObject({ fromSupport: true, authorId: 7 });
      expect(m.supportTicket.update).toHaveBeenCalledOnce();
      expect(m.supportTicket.update.mock.calls[0]?.[0].data).toEqual({ status: 'IN_PROGRESS' });
    });

    it('does NOT change status when already IN_PROGRESS', async () => {
      m.supportTicket.findUnique.mockResolvedValue({ id: 1, userId: 5, subject: 'Help', status: 'IN_PROGRESS' });
      await service.staffReply(7, 1, { body: 'update' });
      expect(m.supportTicket.update).not.toHaveBeenCalled();
    });

    it('notifies the owner with kind reply', async () => {
      m.supportTicket.findUnique.mockResolvedValue({ id: 1, userId: 5, subject: 'Help', status: 'IN_PROGRESS' });
      await service.staffReply(7, 1, { body: 'update' });
      expect(notifications.notifyTicketUpdate.mock.calls[0]?.[0]).toMatchObject({ recruiterUserId: 5, kind: 'reply' });
    });
  });

  // --- listContactMessages -------------------------------------------------

  it('listContactMessages paginates', async () => {
    m.supportContactMessage.count.mockResolvedValue(21);
    m.supportContactMessage.findMany.mockResolvedValue([]);
    const res = await service.listContactMessages({ page: 2 });
    expect(m.supportContactMessage.findMany.mock.calls[0]?.[0].skip).toBe(20);
    expect(res.totalPages).toBe(2);
  });
});
