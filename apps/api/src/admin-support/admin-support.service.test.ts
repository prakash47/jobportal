import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    supportTicket: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    supportTicketMessage: { create: vi.fn() },
    supportTicketNote: { create: vi.fn() },
    supportContactMessage: { count: vi.fn(), findMany: vi.fn() },
    user: { findMany: vi.fn() },
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
  supportTicketNote: { create: Mock };
  supportContactMessage: { count: Mock; findMany: Mock };
  user: { findMany: Mock };
  profileAuditLog: { create: Mock };
  $transaction: Mock;
};

const notifications = { notifyTicketUpdate: vi.fn() };

/**
 * A ticket row as `findUnique` returns it.
 *
 * `notes` and `messages` default to [] because updateStatus and staffReply both
 * end by calling getTicketDetail, which maps over `notes` — a mock without them
 * throws inside the method under test and turns a real assertion failure into a
 * confusing TypeError.
 */
function ticketRow(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: 5,
    subject: 'Help',
    status: 'OPEN',
    messages: [],
    notes: [],
    ...over,
  };
}

describe('AdminSupportService', () => {
  let service: AdminSupportService;

  beforeEach(() => {
    vi.resetAllMocks();
    m.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
    m.profileAuditLog.create.mockResolvedValue({});
    m.supportTicket.update.mockResolvedValue({});
    m.supportTicketMessage.create.mockResolvedValue({ id: 9 });
    m.supportTicketNote.create.mockResolvedValue({ id: 77 });
    m.user.findMany.mockResolvedValue([]);
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

    it('searches subject and company name, case-insensitively', async () => {
      await service.listTickets({ q: 'acme' });
      expect(m.supportTicket.findMany.mock.calls[0]?.[0].where).toEqual({
        OR: [
          { subject: { contains: 'acme', mode: 'insensitive' } },
          { company: { name: { contains: 'acme', mode: 'insensitive' } } },
        ],
      });
    });

    // ?q=% would otherwise match every ticket: Prisma's `contains` compiles to
    // an unescaped LIKE. This exact bug shipped on /sadmin/job-postings and
    // /sadmin/candidates, so it is pinned rather than trusted.
    it('escapes LIKE wildcards so ?q=% is a literal percent', async () => {
      await service.listTickets({ q: '%' });
      const where = m.supportTicket.findMany.mock.calls[0]?.[0].where;
      expect(where.OR[0].subject.contains).toBe('\\%');
      await service.listTickets({ q: '100%_off' });
      const where2 = m.supportTicket.findMany.mock.calls[1]?.[0].where;
      expect(where2.OR[0].subject.contains).toBe('100\\%\\_off');
    });

    // Status and search must AND, never replace each other — narrowing the
    // search while on the Open tab must not silently show resolved tickets.
    it('composes status and search rather than one overwriting the other', async () => {
      await service.listTickets({ status: 'OPEN', q: 'acme' });
      const where = m.supportTicket.findMany.mock.calls[0]?.[0].where;
      expect(where.status).toBe('OPEN');
      expect(where.OR).toHaveLength(2);
    });

    // The count and the page must be filtered by the SAME predicate. A count
    // over an unfiltered table with a filtered page produces pagination that
    // offers pages which render empty.
    it('applies the same where to count and findMany', async () => {
      await service.listTickets({ status: 'OPEN', q: 'acme' });
      expect(m.supportTicket.count.mock.calls[0]?.[0].where).toEqual(
        m.supportTicket.findMany.mock.calls[0]?.[0].where,
      );
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
      m.supportTicket.findUnique.mockResolvedValue(ticketRow());
      await service.updateStatus(1, 1, { status: 'OPEN' });
      expect(m.$transaction).not.toHaveBeenCalled();
      expect(m.profileAuditLog.create).not.toHaveBeenCalled();
      expect(notifications.notifyTicketUpdate).not.toHaveBeenCalled();
    });

    it('writes an audit row with status before/after and no message bodies', async () => {
      m.supportTicket.findUnique.mockResolvedValue(ticketRow());
      await service.updateStatus(99, 1, { status: 'RESOLVED' });
      const audit = m.profileAuditLog.create.mock.calls[0]?.[0].data;
      expect(audit.userId).toBe(99);
      expect(audit.action).toBe('SUPPORT_TICKET_STATUS_CHANGED');
      expect(audit.diff).toEqual({ ticketId: 1, status: { before: 'OPEN', after: 'RESOLVED' } });
      expect(JSON.stringify(audit.diff)).not.toContain('Help');
    });

    it('sets resolvedAt when moving to RESOLVED and clears closedAt', async () => {
      m.supportTicket.findUnique.mockResolvedValue(ticketRow());
      await service.updateStatus(1, 1, { status: 'RESOLVED' });
      const data = m.supportTicket.update.mock.calls[0]?.[0].data;
      expect(data.status).toBe('RESOLVED');
      expect(data.resolvedAt).toBeInstanceOf(Date);
      expect(data.closedAt).toBeNull();
    });

    it('sets closedAt when moving to CLOSED', async () => {
      m.supportTicket.findUnique.mockResolvedValue(ticketRow({ status: 'IN_PROGRESS' }));
      await service.updateStatus(1, 1, { status: 'CLOSED' });
      const data = m.supportTicket.update.mock.calls[0]?.[0].data;
      expect(data.closedAt).toBeInstanceOf(Date);
    });

    // The regression this branch fixes. RESOLVED → CLOSED is the NORMAL end of a
    // ticket's life, and the old `=== 'RESOLVED' ? now : null` nulled resolvedAt
    // on it — so the resolution timestamp survived only for tickets still
    // sitting in RESOLVED, and was destroyed for every ticket that completed.
    //
    // The KEY MUST BE ABSENT, which is a stronger claim than "not a Date".
    // Prisma treats a missing key as "leave the column alone" and an explicit
    // null as "clear it", so `hasOwnProperty` is the only assertion that
    // distinguishes the fix from the bug — `toBeUndefined()` alone passes for
    // both, since reading a missing key also yields undefined.
    it('PRESERVES resolvedAt on RESOLVED -> CLOSED (omits the column entirely)', async () => {
      m.supportTicket.findUnique.mockResolvedValue(ticketRow({ status: 'RESOLVED' }));
      await service.updateStatus(1, 1, { status: 'CLOSED' });
      const data = m.supportTicket.update.mock.calls[0]?.[0].data;
      expect(Object.prototype.hasOwnProperty.call(data, 'resolvedAt')).toBe(false);
      expect(data.closedAt).toBeInstanceOf(Date);
    });

    // The other half of the same rule: a reopen must CLEAR it. A ticket back in
    // IN_PROGRESS is demonstrably not resolved, and a stale timestamp claiming
    // otherwise is worse than an empty one.
    it('CLEARS resolvedAt and closedAt on a reopen to IN_PROGRESS', async () => {
      m.supportTicket.findUnique.mockResolvedValue(ticketRow({ status: 'CLOSED' }));
      await service.updateStatus(1, 1, { status: 'IN_PROGRESS' });
      const data = m.supportTicket.update.mock.calls[0]?.[0].data;
      expect(data.resolvedAt).toBeNull();
      expect(data.closedAt).toBeNull();
    });

    it('fires the bell notification (kind status) and still succeeds when it rejects', async () => {
      m.supportTicket.findUnique.mockResolvedValue(ticketRow());
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
      m.supportTicket.findUnique.mockResolvedValue(ticketRow({ status: 'CLOSED' }));
      await expect(service.staffReply(1, 1, { body: 'hi' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('flips an OPEN ticket to IN_PROGRESS on first staff reply', async () => {
      m.supportTicket.findUnique.mockResolvedValue(ticketRow());
      await service.staffReply(7, 1, { body: 'looking into it' });
      expect(m.supportTicketMessage.create.mock.calls[0]?.[0].data).toMatchObject({ fromSupport: true, authorId: 7 });
      expect(m.supportTicket.update).toHaveBeenCalledOnce();
      expect(m.supportTicket.update.mock.calls[0]?.[0].data).toEqual({ status: 'IN_PROGRESS' });
    });

    it('bumps updatedAt without a status change when already IN_PROGRESS', async () => {
      m.supportTicket.findUnique.mockResolvedValue(ticketRow({ status: 'IN_PROGRESS' }));
      await service.staffReply(7, 1, { body: 'update' });
      expect(m.supportTicket.update).toHaveBeenCalledOnce();
      const data = m.supportTicket.update.mock.calls[0]?.[0].data;
      expect(data.status).toBeUndefined();
      expect(data.updatedAt).toBeInstanceOf(Date);
    });

    it('notifies the owner with kind reply', async () => {
      m.supportTicket.findUnique.mockResolvedValue(ticketRow({ status: 'IN_PROGRESS' }));
      await service.staffReply(7, 1, { body: 'update' });
      expect(notifications.notifyTicketUpdate.mock.calls[0]?.[0]).toMatchObject({ recruiterUserId: 5, kind: 'reply' });
    });
  });

  // --- addNote -------------------------------------------------------------

  describe('addNote', () => {
    it('404s when the ticket is missing', async () => {
      m.supportTicket.findUnique.mockResolvedValue(null);
      await expect(service.addNote(1, 1, { body: 'note' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(m.supportTicketNote.create).not.toHaveBeenCalled();
    });

    it('stores the note against the authoring admin', async () => {
      m.supportTicket.findUnique.mockResolvedValue({ id: 1 });
      await service.addNote(42, 1, { body: 'chased the refund' });
      expect(m.supportTicketNote.create.mock.calls[0]?.[0].data).toEqual({
        ticketId: 1,
        authorId: 42,
        body: 'chased the refund',
      });
    });

    // The three things a note must NOT do. Each is something staffReply DOES,
    // so each is a live copy-paste hazard rather than a hypothetical: a note is
    // invisible to the recruiter, so any of these would either alert them to
    // something they cannot see or misreport the queue's state.
    it('does NOT notify the recruiter', async () => {
      m.supportTicket.findUnique.mockResolvedValue({ id: 1 });
      await service.addNote(42, 1, { body: 'internal' });
      expect(notifications.notifyTicketUpdate).not.toHaveBeenCalled();
    });

    it('does NOT change the ticket status or touch updatedAt', async () => {
      m.supportTicket.findUnique.mockResolvedValue({ id: 1 });
      await service.addNote(42, 1, { body: 'internal' });
      expect(m.supportTicket.update).not.toHaveBeenCalled();
    });

    it('does NOT write to the message thread the recruiter can read', async () => {
      m.supportTicket.findUnique.mockResolvedValue({ id: 1 });
      await service.addNote(42, 1, { body: 'internal' });
      expect(m.supportTicketMessage.create).not.toHaveBeenCalled();
    });

    // Notes are allowed on a CLOSED ticket even though replies 409 — recording
    // why something was closed is most useful right after closing it.
    it('allows a note on a CLOSED ticket', async () => {
      m.supportTicket.findUnique.mockResolvedValue({ id: 1, status: 'CLOSED' });
      await expect(service.addNote(42, 1, { body: 'closed as duplicate' })).resolves.toBeDefined();
    });

    it('audits the note with ids only — never the body', async () => {
      m.supportTicket.findUnique.mockResolvedValue({ id: 1 });
      await service.addNote(42, 1, { body: 'this employer has been abusive' });
      const audit = m.profileAuditLog.create.mock.calls[0]?.[0].data;
      expect(audit.userId).toBe(42);
      expect(audit.action).toBe('SUPPORT_TICKET_NOTE_ADDED');
      expect(audit.diff).toEqual({ ticketId: 1, noteId: 77 });
      expect(JSON.stringify(audit.diff)).not.toContain('abusive');
    });

    // The note and its audit row must land in ONE transaction. Asserted by
    // checking the audit write happened through the tx callback rather than
    // after it — the shared $transaction mock passes the base client as `tx`,
    // so this pins the call ORDER, which is what a mock can actually observe.
    it('writes the note and the audit row inside the same transaction', async () => {
      m.supportTicket.findUnique.mockResolvedValue({ id: 1 });
      let insideTx = false;
      m.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => {
        insideTx = true;
        const out = await fn(prisma);
        insideTx = false;
        return out;
      });
      let auditSawTx = false;
      m.profileAuditLog.create.mockImplementation(async () => {
        auditSawTx = insideTx;
        return {};
      });
      await service.addNote(42, 1, { body: 'note' });
      expect(auditSawTx).toBe(true);
    });
  });

  // --- getTicketDetail: notes ----------------------------------------------

  describe('getTicketDetail notes', () => {
    it('resolves note authors and returns null for an id that no longer exists', async () => {
      m.supportTicket.findUnique.mockResolvedValue(
        ticketRow({
          notes: [
            { id: 1, ticketId: 1, authorId: 42, body: 'a', createdAt: new Date() },
            { id: 2, ticketId: 1, authorId: 99, body: 'b', createdAt: new Date() },
          ],
        }),
      );
      m.user.findMany.mockResolvedValue([{ id: 42, name: 'Asha', email: 'a@x.com' }]);

      const res = await service.getTicketDetail(1);
      expect(res.notes[0]?.author).toEqual({ id: 42, name: 'Asha', email: 'a@x.com' });
      // The deleted-admin case: the note survives its author, by design.
      expect(res.notes[1]?.author).toBeNull();
      expect(res.notes[1]?.body).toBe('b');
    });

    it('does not query users at all when there are no notes', async () => {
      m.supportTicket.findUnique.mockResolvedValue(ticketRow());
      await service.getTicketDetail(1);
      expect(m.user.findMany).not.toHaveBeenCalled();
    });

    it('asks for each distinct author once, not once per note', async () => {
      m.supportTicket.findUnique.mockResolvedValue(
        ticketRow({
          notes: [
            { id: 1, ticketId: 1, authorId: 42, body: 'a', createdAt: new Date() },
            { id: 2, ticketId: 1, authorId: 42, body: 'b', createdAt: new Date() },
          ],
        }),
      );
      await service.getTicketDetail(1);
      expect(m.user.findMany.mock.calls[0]?.[0].where.id.in).toEqual([42]);
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
