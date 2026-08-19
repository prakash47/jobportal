import { prisma, type Prisma } from '@jobportal/db';

/**
 * The per-status tally of one broadcast's recipient ledger.
 *
 * ⚠ SHARED BY EVERY PATH THAT CLOSES A BROADCAST OUT, and that is the point.
 * There are three: the worker's normal `finalize()`, the worker's killswitch
 * halt, and the admin's own `cancel()`. Before this existed only the first
 * rolled the ledger up, so a send that was STOPPED — after mailing thousands of
 * people — sat in the console log reading "0 sent" forever, which is the single
 * most misleading thing this feature could say. Anyone auditing what left the
 * building would have concluded nothing had.
 *
 * A pure `groupBy` rather than four `count`s: one indexed query over
 * `@@index([broadcastId, status])` instead of four, and the four numbers are
 * then guaranteed to describe the same instant.
 */
export interface BroadcastCounts {
  pending: number;
  sent: number;
  skipped: number;
  failed: number;
}

type Client = Pick<typeof prisma, 'broadcastRecipient'> | Prisma.TransactionClient;

export async function tallyRecipients(
  client: Client,
  broadcastId: number,
): Promise<BroadcastCounts> {
  const grouped = await client.broadcastRecipient.groupBy({
    by: ['status'],
    where: { broadcastId },
    _count: { _all: true },
  });
  const countOf = (s: string): number =>
    grouped.find((g) => g.status === s)?._count._all ?? 0;
  return {
    pending: countOf('PENDING'),
    sent: countOf('SENT'),
    skipped: countOf('SKIPPED'),
    failed: countOf('FAILED'),
  };
}

/** The three columns a closed-out broadcast freezes onto its own row. */
export function frozenCounts(counts: BroadcastCounts): {
  sentCount: number;
  skippedCount: number;
  failedCount: number;
} {
  return {
    sentCount: counts.sent,
    skippedCount: counts.skipped,
    failedCount: counts.failed,
  };
}
