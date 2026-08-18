import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { prisma, Prisma } from '@jobportal/db';
import { FLAG, isFlagEnabled } from '@jobportal/feature-flags';
import {
  DEFAULT_TRANSACTION_TAB,
  TRANSACTION_SELECT,
  type TransactionRow,
  transactionWhere,
} from '@jobportal/domain/txn-log-params';
import { toTransactionsCsv, transactionsCsvFilename } from './csv';
import type { ExportTransactionsInput } from './dto';

/**
 * Most rows a single export may contain.
 *
 * The cap exists to bound the in-memory build, but the way it FAILS is the part
 * that matters: it throws rather than truncating. A truncated CSV is a file
 * that looks complete, sums to a smaller number, and gives its recipient no
 * signal at all that anything is missing.
 */
const MAX_EXPORT_ROWS = 50_000;

@Injectable()
export class AdminTransactionsService {
  private readonly logger = new Logger(AdminTransactionsService.name);

  /**
   * Emergency stop for the export (Layer 3, non-bypassable).
   *
   * Gates the EXPORT ONLY. /sadmin/transactions keeps rendering its list and
   * detail pages while this is on — killing the extraction must not blind staff
   * to what was paid, which is the same rule admin-jobs, admin-support and
   * admin-reports already follow.
   *
   * ⚠ Polarity: `killswitch.*` throws when the flag is ENABLED. Do not copy the
   * shape of a feature toggle like `moderation.reports.enabled`, which throws
   * on `!enabled` — reports.service.ts documents a near-miss where the two were
   * one keystroke apart.
   */
  private async assertExportEnabled(): Promise<void> {
    if (await isFlagEnabled(FLAG.KILL_ADMIN_TRANSACTION_EXPORT)) {
      throw new ServiceUnavailableException('Transaction export is temporarily unavailable');
    }
  }

  /**
   * Export the ledger as a CSV, and record who pulled it.
   *
   * The where-clause and the select come from `@jobportal/domain/txn-log-params`
   * — the SAME ones the console's list page uses. That import is the whole
   * reason the module exists: a re-implementation here would produce a file
   * that disagrees with the screen for the same filters, and nobody ever
   * cross-checks a downloaded spreadsheet against a browser tab, so the
   * divergence would never surface.
   */
  async export(
    adminUserId: number,
    input: ExportTransactionsInput,
  ): Promise<{ filename: string; csv: Buffer }> {
    await this.assertExportEnabled();

    const tab = input.tab ?? DEFAULT_TRANSACTION_TAB;
    const where = transactionWhere({
      tab,
      from: input.from,
      to: input.to,
      q: input.q,
    });

    // Pre-count so an over-large export is refused BEFORE the rows are loaded,
    // rather than after they are already in memory.
    const total = await prisma.paymentOrder.count({ where });
    if (total > MAX_EXPORT_ROWS) {
      throw new BadRequestException(
        `This range contains ${total.toLocaleString('en-IN')} transactions; the maximum for one export is ${MAX_EXPORT_ROWS.toLocaleString('en-IN')}. Narrow the date range and export again.`,
      );
    }

    const rows: TransactionRow[] = await prisma.paymentOrder.findMany({
      where,
      // The id tiebreak is not decorative: seeded and bulk-created rows share a
      // createdAt to the millisecond, and an unstable sort makes the file's row
      // order differ between two exports of the same range.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: TRANSACTION_SELECT,
    });

    const csv = Buffer.from(toTransactionsCsv(rows), 'utf8');

    // Totals for the audit row — computed from the rows actually written, not
    // from a second query, so the record cannot disagree with the file.
    //
    // Only PAID attempts contribute money. Summing gross across every status
    // would count failed and abandoned checkouts as revenue, which is the
    // headline way this feature could lie.
    const paid = rows.filter((row) => row.status === 'PAID');
    const grossInPaise = paid.reduce((sum, row) => sum + row.amountInPaise, 0);
    const taxableInPaise = paid.reduce((sum, row) => sum + (row.invoice?.taxableInPaise ?? 0), 0);
    const nullTaxableRows = paid.filter((row) => row.invoice?.taxableInPaise == null).length;

    await prisma.profileAuditLog.create({
      data: {
        userId: adminUserId,
        action: 'BILLING_TRANSACTIONS_EXPORTED',
        // ⚠ Ranges, counts and totals ONLY. No company names, no invoice
        // numbers, no buyer snapshot, and `hadQuery` rather than the raw `q` —
        // the search terms would name the company being investigated, and this
        // row must not become a second uncontrolled copy of the export it
        // exists to police.
        diff: {
          from: input.from,
          to: input.to,
          tab,
          hadQuery: input.q !== undefined && input.q.length > 0,
          rowCount: rows.length,
          grossInPaise,
          taxableInPaise,
          nullTaxableRows,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    // ⚠ The read runs OUTSIDE a transaction and the audit row commits on its
    // own. That is a deliberate divergence from admin-otp-sessions, which does
    // read-and-audit in ONE transaction: there, the read reveals a live
    // credential, so it must not commit if the audit fails. Here the read is
    // idempotent and destroys nothing, and holding a transaction open across a
    // 50k-row scan would be strictly worse for no correctness gain.
    this.logger.warn(
      `Transaction ledger exported by admin ${adminUserId}: ${rows.length} rows, ${input.from}..${input.to}, tab=${tab}`,
    );

    return { filename: transactionsCsvFilename(input.from, input.to), csv };
  }
}
