import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { prisma, Prisma } from '@jobportal/db';
import { NotificationsProducerService } from '../recruiter-notifications/notifications-producer.service';
import type {
  ListContactMessagesQueryInput,
  ListTicketsQueryInput,
  StaffReplyInput,
  UpdateTicketStatusInput,
} from './dto';

const PAGE_SIZE = 20;

@Injectable()
export class AdminSupportService {
  private readonly logger = new Logger(AdminSupportService.name);

  constructor(private readonly notifications: NotificationsProducerService) {}

  // Ticket queue. Unlike KYC there is no junk state, so the unfiltered view
  // shows every ticket; a status filter narrows it.
  async listTickets(query: ListTicketsQueryInput) {
    const page = query.page ?? 1;
    const where: Prisma.SupportTicketWhereInput = query.status
      ? { status: query.status }
      : {};

    const [total, rows] = await Promise.all([
      prisma.supportTicket.count({ where }),
      prisma.supportTicket.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          subject: true,
          category: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, name: true, email: true } },
          company: { select: { id: true, name: true } },
          _count: { select: { messages: true } },
        },
      }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        subject: r.subject,
        category: r.category,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        user: r.user,
        company: r.company,
        messageCount: r._count.messages,
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
  }

  // Full ticket thread for the reviewing admin. Tickets are creator-scoped, so
  // every non-staff message is by ticket.user — the UI labels a message
  // fromSupport ? 'Support' : user.name.
  async getTicketDetail(ticketId: number) {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        company: { select: { id: true, name: true, slug: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async updateStatus(adminUserId: number, ticketId: number, input: UpdateTicketStatusInput) {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, userId: true, subject: true, status: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    // Idempotent no-op — no state change, no audit row, no notification.
    if (ticket.status === input.status) {
      return this.getTicketDetail(ticketId);
    }

    const newStatus = input.status;
    await prisma.$transaction(async (tx) => {
      await tx.supportTicket.update({
        where: { id: ticketId },
        data: {
          status: newStatus,
          resolvedAt: newStatus === 'RESOLVED' ? new Date() : null,
          closedAt: newStatus === 'CLOSED' ? new Date() : null,
        },
      });
      await tx.profileAuditLog.create({
        data: {
          userId: adminUserId,
          action: 'SUPPORT_TICKET_STATUS_CHANGED',
          // Only ids + statuses — never the ticket subject/description or any
          // message body (those are user content, out of the audit trail).
          diff: {
            ticketId,
            status: { before: ticket.status, after: newStatus },
          } as unknown as Prisma.InputJsonValue,
        },
      });
    });

    this.logger.log(`admin=${adminUserId} set ticket=${ticketId} → ${newStatus}`);

    // Bell notification to the ticket owner. Fire-and-log after commit so it can
    // never roll back or 5xx the admin action.
    this.notifications
      .notifyTicketUpdate({
        recruiterUserId: ticket.userId,
        ticketId,
        subject: ticket.subject,
        kind: 'status',
        status: newStatus,
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `ticket-status notification failed for ticket=${ticketId}: ${(err as Error).message}`,
        );
      });

    return this.getTicketDetail(ticketId);
  }

  async staffReply(adminUserId: number, ticketId: number, input: StaffReplyInput) {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, userId: true, subject: true, status: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === 'CLOSED') {
      throw new ConflictException('Ticket is closed — reopen it with a status change to reply.');
    }

    // A staff reply on a brand-new OPEN ticket moves it to IN_PROGRESS (support
    // has engaged). RESOLVED/IN_PROGRESS keep their status.
    const engage = ticket.status === 'OPEN';

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.supportTicketMessage.create({
        data: { ticketId, authorId: adminUserId, fromSupport: true, body: input.body },
      });
      // Always touch the parent so updatedAt tracks the latest activity (the
      // recruiter's "Last update" column reads it). Engaging also flips status;
      // otherwise just bump updatedAt.
      await tx.supportTicket.update({
        where: { id: ticketId },
        data: engage ? { status: 'IN_PROGRESS' } : { updatedAt: new Date() },
      });
      return created;
    });

    this.notifications
      .notifyTicketUpdate({
        recruiterUserId: ticket.userId,
        ticketId,
        subject: ticket.subject,
        kind: 'reply',
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `ticket-reply notification failed for ticket=${ticketId}: ${(err as Error).message}`,
        );
      });

    return message;
  }

  async listContactMessages(query: ListContactMessagesQueryInput) {
    const page = query.page ?? 1;

    const [total, items] = await Promise.all([
      prisma.supportContactMessage.count(),
      prisma.supportContactMessage.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          name: true,
          email: true,
          subject: true,
          message: true,
          createdAt: true,
          user: { select: { id: true, email: true } },
        },
      }),
    ]);

    return {
      items,
      total,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
  }
}
