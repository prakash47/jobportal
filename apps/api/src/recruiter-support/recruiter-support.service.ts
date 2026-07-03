import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { EmailService } from '../email/email.service';
import type { CreateTicketInput, ReplyTicketInput, ContactMessageInput } from './dto';

// Recruiter Help & Support (killswitch feature). This service owns the
// mutations only — reads (the "my tickets" list + a ticket thread) happen in
// the recruiter Next.js RSCs directly via Prisma, matching this repo's
// reads/writes split. killswitch.recruiter_help_support seeded OFF means the
// feature is LIVE; flipping it ON makes every entry point below throw 503 (L3)
// and the /support/* pages 404 (L2).
const HELP_SUPPORT_KILLSWITCH_FLAG = 'killswitch.recruiter_help_support';

interface SupportCaller {
  id: number;
  companyId: number;
  name: string;
  email: string;
  companyName: string;
}

@Injectable()
export class RecruiterSupportService {
  private readonly logger = new Logger(RecruiterSupportService.name);

  constructor(private readonly email: EmailService) {}

  // --- Gates ----------------------------------------------------------------

  private async assertEnabled(): Promise<void> {
    if (await isFlagEnabled(HELP_SUPPORT_KILLSWITCH_FLAG)) {
      throw new ServiceUnavailableException(
        'Help & support is temporarily unavailable',
      );
    }
  }

  private async getCaller(userId: number): Promise<SupportCaller> {
    const rec = await prisma.recruiter.findUnique({
      where: { userId },
      select: {
        id: true,
        companyId: true,
        deactivatedAt: true,
        user: { select: { name: true, email: true } },
        company: { select: { name: true } },
      },
    });
    if (!rec) throw new NotFoundException('Recruiter profile not found');
    if (rec.deactivatedAt) {
      throw new ForbiddenException('Your account has been deactivated');
    }
    return {
      id: rec.id,
      companyId: rec.companyId,
      name: rec.user.name,
      email: rec.user.email,
      companyName: rec.company.name,
    };
  }

  // Best-effort ops-inbox forwarding. The DB row is the record; a missing inbox
  // config or a Redis/enqueue hiccup must never fail the request. Deliberately
  // fire-and-log (never awaited into the caller's error path).
  private forwardTicketOpened(
    caller: SupportCaller,
    ticket: { id: number; subject: string; category: string; description: string },
  ): void {
    const inbox = (process.env.SUPPORT_INBOX_EMAIL ?? '').trim();
    if (!inbox) return;
    this.email
      .enqueueSupportTicketOpened(inbox, {
        ticketId: ticket.id,
        subject: ticket.subject,
        category: ticket.category,
        companyName: caller.companyName,
        recruiterName: caller.name,
        recruiterEmail: caller.email,
        description: ticket.description,
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `support-ticket-opened enqueue failed for ticket ${ticket.id}: ${(err as Error).message}`,
        );
      });
  }

  private forwardContactMessage(
    contact: { id: number; name: string; email: string; subject: string; message: string },
  ): void {
    const inbox = (process.env.SUPPORT_INBOX_EMAIL ?? '').trim();
    if (!inbox) return;
    this.email
      .enqueueSupportContactMessage(inbox, {
        contactId: contact.id,
        name: contact.name,
        email: contact.email,
        subject: contact.subject,
        message: contact.message,
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `support-contact-message enqueue failed for contact ${contact.id}: ${(err as Error).message}`,
        );
      });
  }

  // --- Tickets --------------------------------------------------------------

  async createTicket(userId: number, input: CreateTicketInput) {
    await this.assertEnabled();
    const caller = await this.getCaller(userId);

    const ticket = await prisma.supportTicket.create({
      data: {
        userId,
        companyId: caller.companyId,
        subject: input.subject,
        description: input.description,
        category: input.category,
      },
      select: { id: true, subject: true, category: true, status: true, createdAt: true },
    });

    this.forwardTicketOpened(caller, {
      id: ticket.id,
      subject: ticket.subject,
      category: ticket.category,
      description: input.description,
    });

    return ticket;
  }

  async reply(userId: number, ticketId: number, input: ReplyTicketInput) {
    await this.assertEnabled();

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, userId: true, status: true },
    });
    // Not-found OR not-owned both 404 so a caller can't probe other users' ticket ids.
    if (!ticket || ticket.userId !== userId) {
      throw new NotFoundException('Ticket not found');
    }
    if (ticket.status === 'CLOSED') {
      throw new ConflictException(
        'This ticket is closed — raise a new ticket instead.',
      );
    }

    // A recruiter reply to a RESOLVED ticket reopens it (they still need help).
    // OPEN / IN_PROGRESS stay as-is.
    const reopened = ticket.status === 'RESOLVED';

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.supportTicketMessage.create({
        data: { ticketId, authorId: userId, fromSupport: false, body: input.body },
        select: { id: true, body: true, fromSupport: true, createdAt: true },
      });
      // Always touch the parent so its updatedAt tracks the latest activity — the
      // "Last update" column reads it. A reopen also flips status + clears
      // resolvedAt (that update fires @updatedAt too); a plain reply bumps
      // updatedAt on its own.
      await tx.supportTicket.update({
        where: { id: ticketId },
        data: reopened
          ? { status: 'IN_PROGRESS', resolvedAt: null }
          : { updatedAt: new Date() },
      });
      return created;
    });

    return { ...message, reopened };
  }

  async close(userId: number, ticketId: number) {
    await this.assertEnabled();

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, userId: true, status: true, closedAt: true },
    });
    if (!ticket || ticket.userId !== userId) {
      throw new NotFoundException('Ticket not found');
    }
    // Idempotent: closing an already-closed ticket is a no-op (no write).
    if (ticket.status === 'CLOSED') {
      return { id: ticket.id, status: ticket.status, closedAt: ticket.closedAt };
    }

    const updated = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: 'CLOSED', closedAt: new Date() },
      select: { id: true, status: true, closedAt: true },
    });
    return updated;
  }

  // --- Contact Us -----------------------------------------------------------

  async submitContact(userId: number, input: ContactMessageInput) {
    await this.assertEnabled();
    await this.getCaller(userId); // must be an active recruiter

    const contact = await prisma.supportContactMessage.create({
      data: {
        userId,
        name: input.name,
        email: input.email,
        subject: input.subject,
        message: input.message,
      },
      select: { id: true, name: true, email: true, subject: true, message: true },
    });

    this.forwardContactMessage(contact);

    return { id: contact.id };
  }
}
