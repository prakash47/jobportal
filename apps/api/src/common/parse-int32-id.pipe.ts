import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { isInt32Id } from './int32';

/**
 * Parses a route parameter into a usable database id.
 *
 * `ParseIntPipe` is NOT sufficient on its own, and the gap is a real 500 rather
 * than a theoretical one: it happily accepts 99999999999, which is a perfectly
 * valid JavaScript integer but overflows Postgres `int4`. Prisma does not return
 * "no rows" for that — it THROWS ("value is out of range for type integer"),
 * which escapes as an unhandled 500 and, on any route an attacker can reach,
 * lets them manufacture 500s and Sentry noise by adding a digit to a URL.
 *
 * This repo has now shipped that same bug three times — on `/v1/jobs/:slug`,
 * on `/sadmin/job-postings/[id]`, and on this module's own `PATCH
 * /admin/billing/subscriptions/:id`, where it was caught by firing a
 * 99999999999 id at the live endpoint. The first two were fixed in place;
 * this pipe exists so the fix is reusable rather than re-derived a fourth time.
 *
 * 400 rather than 404, following the reasoning already written at
 * common/int32.ts: a caller asking about id 3000000000 has asked a MALFORMED
 * question, not a question whose answer happens to be "no such row". Clamping to
 * MAX_INT32 would be worse still — it would silently answer about a different
 * record than the one asked for.
 */
@Injectable()
export class ParseInt32IdPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    // Number() also accepts hex and exponent notation ('0x1a', '1e1'), so the
    // digits-only test does real work beyond Number.isInteger — the same guard
    // the sadmin [id] routes apply before they spend a query.
    const parsed = /^\d+$/.test(value) ? Number(value) : Number.NaN;
    if (!isInt32Id(parsed)) {
      throw new BadRequestException('Invalid id');
    }
    return parsed;
  }
}
