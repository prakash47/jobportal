import { z } from 'zod';
import {
  TRANSACTION_TABS,
  istDaySpan,
  parseIstDay,
} from '@jobportal/domain/txn-log-params';

// CSV export of the Transaction & Revenue Log (/sadmin/transactions → Export).
// Zod + .strict(), matching admin-billing's dto.ts; there is no class-validator
// anywhere in this app and no global ValidationPipe, so a typed `@Body() dto: X`
// would be entirely unvalidated at runtime.

/**
 * An IST calendar day, `YYYY-MM-DD`.
 *
 * Validated through the SAME `parseIstDay` the console's URL parser uses, so
 * the API and the screen cannot disagree about what a valid day is. The regex
 * alone would accept `2026-02-31`; parseIstDay round-trips the parsed date and
 * rejects the rollover.
 */
const istDaySchema = z
  .string()
  .refine((value) => parseIstDay(value) !== undefined, {
    message: 'Expected a real calendar day in YYYY-MM-DD form',
  });

/**
 * The widest window a single export may cover.
 *
 * 366 days — one financial year plus a day for the leap case, which is the
 * largest range an accountant has a legitimate reason to pull in one file.
 */
const MAX_EXPORT_SPAN_DAYS = 366;

/**
 * ⚠ `from` and `to` are BOTH REQUIRED here, unlike the list page where they are
 * optional.
 *
 * Two reasons, and the first is the load-bearing one. A CSV with no period is
 * an accounting document that cannot be reconciled against anything — nobody
 * receiving it can tell whether it covers a month, a year, or everything, and
 * the numbers in it are therefore unusable rather than merely inconvenient.
 * Second, requiring them means the FILENAME can always name the window, so the
 * period survives the file being renamed, mailed and opened six months later.
 *
 * The list page has no such duty: it is a screen with its own visible filter
 * controls, and an admin looking at it can see what they are looking at.
 */
export const ExportTransactionsDto = z
  .object({
    from: istDaySchema,
    to: istDaySchema,
    tab: z.enum(TRANSACTION_TABS).optional(),
    q: z.string().trim().max(100).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.from > value.to) {
      // Lexicographic comparison is exact for zero-padded YYYY-MM-DD.
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'The end of the range must not be before its start',
      });
      return;
    }
    // REJECT rather than clamp. A silently narrowed export hands over a file
    // that looks complete and is not — the single most dangerous failure this
    // feature can have, because the recipient has no way to detect it.
    const span = istDaySpan(value.from, value.to);
    if (span > MAX_EXPORT_SPAN_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: `Range spans ${span} days; the maximum for one export is ${MAX_EXPORT_SPAN_DAYS}. Narrow the range and export again.`,
      });
    }
  });

export type ExportTransactionsInput = z.infer<typeof ExportTransactionsDto>;
