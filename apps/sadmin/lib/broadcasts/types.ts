// Wire types for the AdminGuard'd /admin/broadcasts endpoints in apps/api.
//
// ⚠ WHY THIS CONSOLE READS THE API RATHER THAN PRISMA. /reports, /job-postings
// and /subscriptions read Postgres directly in the RSC, and this one does not —
// the same call lib/support/types.ts records, for a sharper reason. The number
// this console shows before a send ("this will reach 4,182 people") has to be
// produced by the SAME predicate that decides who actually gets the message. A
// Prisma query here would be a second definition of every segment, and the two
// would drift silently: nobody cross-checks a preview count against a delivery
// ledger, so an admin would keep approving a number that was never what happened.
//
// The cost is that these interfaces are HAND-WRITTEN and TypeScript cannot check
// them against what the API actually returns. Dates arrive as ISO strings, not
// Date objects, and are typed as such — the shipped /admin console typed a field
// as non-null over the same kind of fetch, which TypeErrored at runtime while
// `pnpm typecheck` stayed green. Every field here was read off
// admin-broadcasts.service.ts, not guessed.

import type {
  BroadcastCategory,
  BroadcastRecipientStatus,
  BroadcastSegment,
  BroadcastStatus,
} from '@jobportal/db';

/** A row in the broadcast log. Mirrors AdminBroadcastsService.list's select. */
export interface BroadcastListItem {
  id: number;
  subject: string;
  category: BroadcastCategory;
  segment: BroadcastSegment;
  status: BroadcastStatus;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  /** Null until the planner has resolved the segment — i.e. on every DRAFT. */
  recipientCount: number | null;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
  /** ISO 8601 — JSON has no Date. */
  createdAt: string;
  /** Null on a draft; the moment of DISPATCH, not of the last delivery. */
  sentAt: string | null;
}

export interface BroadcastListResult {
  items: BroadcastListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * A recipient that did not receive the message.
 *
 * Only SKIPPED and FAILED rows are returned — a successful send has thousands of
 * identical SENT rows and listing them would bury the handful worth reading.
 */
export interface BroadcastProblemRow {
  id: number;
  email: string;
  status: BroadcastRecipientStatus;
  statusReason: string | null;
}

export interface BroadcastDetail extends BroadcastListItem {
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  /** Null when the composing admin's account no longer exists. */
  author: { id: number; name: string; email: string } | null;
  testSentAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
  /**
   * Live counts read from the ledger, as distinct from the rolled-up columns on
   * the row. While a broadcast is SENDING the two legitimately differ: these are
   * the truth right now, the columns are the frozen record written at finalize.
   */
  progress: { pending: number; sent: number; skipped: number; failed: number };
  problems: BroadcastProblemRow[];
  /** True when the problem list hit its cap and is not the whole story. */
  problemsTruncated: boolean;
}

/** POST /admin/broadcasts/preview-count. */
export interface PreviewCountResult {
  segment: BroadcastSegment;
  emailRecipients: number;
  /**
   * Zero for a job-seeker segment, and narrowed to the recruiter subset on
   * ALL_USERS — apps/web has no notification surface to render a row on.
   */
  inAppRecipients: number;
}
