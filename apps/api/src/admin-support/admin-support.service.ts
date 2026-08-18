import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { prisma, Prisma } from '@jobportal/db';
// Prisma's `contains` compiles to an unescaped LIKE, so an un-escaped `?q=%`
// matches every ticket — the bug class this repo has already shipped twice
// (/sadmin/job-postings and /sadmin/candidates). Imported from @jobportal/domain
// rather than given a fourth definition: PROGRESS.md already carries the
// two-definitions problem as an open follow-up, and apps/api can reach packages.
import { escapeLikePattern } from '@jobportal/domain/txn-log-params';
import { NotificationsProducerService } from '../recruiter-notifications/notifications-producer.service';
import type {
  AddNoteInput,
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
  // shows every ticket; a status filter narrows it, and `?q` narrows it further.
  //
  // Status and search COMPOSE (AND, not OR): narrowing the search must not throw
  // the admin off the tab they are looking at, which is the same rule the
  // console's own href builder enforces on the URL side.
  async listTickets(query: ListTicketsQueryInput) {
    const page = query.page ?? 1;
    const where: Prisma.SupportTicketWhereInput = {};
    if (query.status) where.status = query.status;

    if (query.q) {
      // Escaped, then `mode: 'insensitive'` — Postgres LIKE is case-sensitive by
      // default, and a search where "acme" misses "Acme" reads as broken.
      //
      // Subject + company name only. Deliberately NOT `description` or message
      // bodies: staff search this queue to FIND a ticket they already know of
      // ("the Acme billing one"), and full-text over every body would surface a
      // ticket because a word appears buried in a recruiter's paragraph, which
      // is noise rather than a match. The raiser's own name/email is likewise
      // out — company is the identifier staff actually work in.
      const needle = escapeLikePattern(query.q);
      where.OR = [
        { subject: { contains: needle, mode: 'insensitive' } },
        { company: { name: { contains: needle, mode: 'insensitive' } } },
      ];
    }

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
  //
  // ⚠ `notes` is STAFF-ONLY and this method is the reason that is safe: it is
  // reachable only through AdminSupportController, which is AdminGuard'd whole.
  // The recruiter's equivalent read lives in RecruiterSupportService and in the
  // recruiter portal's own RSC, and NEITHER selects this relation. If this
  // method ever gains a non-admin caller, the notes include must move behind a
  // parameter — see the warning on SupportTicketNote in schema.prisma.
  async getTicketDetail(ticketId: number) {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        company: { select: { id: true, name: true, slug: true } },
        messages: { orderBy: { createdAt: 'asc' } },
        notes: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    // Note authors are loose ids (no FK), so they are resolved separately rather
    // than joined. An id that no longer resolves keeps its note and renders as
    // "Unknown admin" client-side — the note outliving the account is the point.
    const authorIds = [...new Set(ticket.notes.map((n) => n.authorId))];
    const authors =
      authorIds.length === 0
        ? []
        : await prisma.user.findMany({
            where: { id: { in: authorIds } },
            select: { id: true, name: true, email: true },
          });
    const byId = new Map(authors.map((a) => [a.id, a]));

    return {
      ...ticket,
      notes: ticket.notes.map((n) => ({
        ...n,
        author: byId.get(n.authorId) ?? null,
      })),
    };
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
          // resolvedAt is CLEARED on a reopen and PRESERVED on a close.
          //
          // The obvious `=== 'RESOLVED' ? now : null` nulls it on every other
          // transition, including RESOLVED → CLOSED — the normal end of a
          // ticket's life. That destroyed the resolution timestamp for exactly
          // the tickets whose lifecycle completed, so time-to-resolution was
          // recoverable only for tickets still sitting in RESOLVED. `undefined`
          // is Prisma's "leave this column alone", which is the distinction the
          // old ternary could not express.
          //
          // OPEN/IN_PROGRESS still null it, and that is deliberate rather than
          // an oversight: a reopened ticket is genuinely not resolved, and a
          // stale timestamp claiming otherwise is worse than an empty one. It
          // will be re-stamped when the ticket is resolved again.
          resolvedAt:
            newStatus === 'RESOLVED' ? new Date() : newStatus === 'CLOSED' ? undefined : null,
          // closedAt takes the mirror-image treatment: cleared when the ticket
          // leaves CLOSED (it is demonstrably not closed any more), stamped on
          // entry. RESOLVED is not an exception here the way CLOSED is above,
          // because RESOLVED → CLOSED is a real progression whereas
          // CLOSED → RESOLVED is a reopen.
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

  /**
   * Add a staff-only note to a ticket.
   *
   * Three things this deliberately does NOT do, each of which the staff-reply
   * path above DOES do, and each of which would turn a private note into a
   * disclosure:
   *
   *  1. **No notification.** `notifyTicketUpdate` would ring the recruiter's
   *     bell with "your ticket was updated" for a note they cannot see — an
   *     alert pointing at nothing, and a signal that staff are discussing them.
   *  2. **No status change.** A reply on an OPEN ticket engages it to
   *     IN_PROGRESS because support has answered. Writing a note to yourself is
   *     not an answer, and flipping the queue state on one would make the tab an
   *     admin works from lie about what has been responded to.
   *  3. **No `updatedAt` touch.** That column drives the recruiter's own
   *     "Last update" column, so bumping it advertises activity on a ticket
   *     nothing visible happened to.
   *
   * Notes ARE allowed on a CLOSED ticket, unlike replies (which 409). Recording
   * why something was closed is most useful immediately after closing it, and
   * since a note reaches nobody there is no reopen semantics to get wrong.
   */
  async addNote(adminUserId: number, ticketId: number, input: AddNoteInput) {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    // Note + audit row commit together. Prisma interactive transactions commit
    // on return and roll back only on throw, so there is no path where the note
    // exists without its audit row.
    const note = await prisma.$transaction(async (tx) => {
      const created = await tx.supportTicketNote.create({
        data: { ticketId, authorId: adminUserId, body: input.body },
      });
      await tx.profileAuditLog.create({
        data: {
          userId: adminUserId,
          action: 'SUPPORT_TICKET_NOTE_ADDED',
          // ids ONLY — never the note body. A note is the candid staff
          // assessment of a customer; copying it here would put the module's
          // most sensitive free text into the one table kept body-free by rule.
          diff: { ticketId, noteId: created.id } as unknown as Prisma.InputJsonValue,
        },
      });
      return created;
    });

    this.logger.log(`admin=${adminUserId} noted ticket=${ticketId}`);
    return note;
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
