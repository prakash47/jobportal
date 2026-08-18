// Wire types for the AdminGuard'd /admin/support endpoints in apps/api.
//
// ⚠ WHY THIS CONSOLE READS THE API RATHER THAN PRISMA. /reports, /job-postings
// and /subscriptions read Postgres directly in the RSC, and this one does not.
// The difference is that support already HAS a tested service layer: the list,
// the detail, the OPEN → IN_PROGRESS engage rule, the reopen-on-reply rule and
// the CLOSED 409 are 57 tests' worth of behaviour that the write path depends
// on. Re-implementing the list query here would fork the where-clause away from
// the service the mutations run through, and the two would drift silently. This
// is also the shape lib/admin-api.ts's own comment says the /admin console
// migration would arrive in.
//
// The cost is that these interfaces are HAND-WRITTEN and TypeScript cannot check
// them against what the API actually returns. Dates arrive as ISO strings, not
// Date objects, and are typed as such — the shipped /admin console typed
// `company` as non-null over the same fetch, which would have TypeErrored at
// runtime the moment a ticket without one existed while `pnpm typecheck` stayed
// green. Every field here was read off admin-support.service.ts, not guessed.

import type { SupportTicketCategory, SupportTicketStatus } from '@jobportal/db';

/** A row in the ticket queue. Mirrors AdminSupportService.listTickets. */
export interface TicketListItem {
  id: number;
  subject: string;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  /** ISO 8601 — JSON has no Date. */
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  user: { id: number; name: string; email: string };
  /**
   * Non-null today because SupportTicket.companyId is a required FK, which is
   * also what makes tickets recruiter-only. If candidate intake ever lands it
   * becomes nullable, and this type is where that must be reflected FIRST — the
   * old /admin console's non-null declaration over the same endpoint is exactly
   * the trap: typecheck passes and the page throws on the first null.
   */
  company: { id: number; name: string };
}

export interface TicketListResult {
  items: TicketListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** One message in the thread. EVERY row here is visible to the recruiter. */
export interface TicketMessage {
  id: number;
  authorId: number;
  /** A label ("Support" vs the recruiter's name), NOT a visibility flag. */
  fromSupport: boolean;
  body: string;
  createdAt: string;
}

/**
 * A staff-only note. Comes from a different table than TicketMessage, and that
 * separation is the privacy mechanism rather than a modelling preference — see
 * the warning on SupportTicketNote in schema.prisma.
 */
export interface TicketNote {
  id: number;
  authorId: number;
  body: string;
  createdAt: string;
  /** null when the authoring admin account no longer exists. */
  author: { id: number; name: string; email: string } | null;
}

export interface TicketDetail {
  id: number;
  subject: string;
  description: string;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: number; name: string; email: string };
  company: { id: number; name: string; slug: string };
  messages: TicketMessage[];
  notes: TicketNote[];
}

/**
 * A "Contact us" submission. Read-only by design: SupportContactMessage carries
 * no status, no assignee and no notes, and giving it any of those is a schema
 * change the owner deliberately deferred.
 */
export interface ContactMessage {
  id: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
  /** null when the submitter's account was deleted (userId is SetNull). */
  user: { id: number; email: string } | null;
}

export interface ContactListResult {
  items: ContactMessage[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
