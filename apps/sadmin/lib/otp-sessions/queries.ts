// OTP Sessions reads.
//
// Reads/writes split (the repo's topology): the LIST is display-only, so every
// row comes straight from Postgres via Prisma inside the RSC — no BFF hop and no
// new API endpoint, the same call lib/dashboard/queries.ts and lib/employers/
// queries.ts make. Revealing a code is the opposite case and deliberately does
// NOT live here: it writes a ProfileAuditLog row, so it goes through apps/api
// where AdminGuard, Zod validation and the audit write all apply. See
// components/otp-sessions/RevealCodeButton.tsx.
//
// ⚠ `code` is never selected. See the OtpSessionChallenge doc comment in
// ./format for why that is load-bearing rather than tidiness.
//
// WHY RAW SQL (CLAUDE.md §3.2 permits `Prisma.sql`; lib/dashboard/queries.ts is
// the existing precedent):
//
//   1. The total is a COUNT DISTINCT over signupId, and Prisma's query API has
//      no count-distinct. The model-API workaround is
//      `groupBy({ by: ['signupId'] }).length`, which drags every in-flight
//      signup attempt across the wire to compute one integer.
//   2. The page is a GROUP BY ordered by an aggregate. Once the count beside it
//      is raw, writing this half in the model API would leave one paginated
//      list expressed in two dialects, where the two halves must agree exactly
//      or the over-range redirect misfires.

import { prisma, Prisma } from '@jobportal/db';
import {
  OTP_SESSIONS_PAGE_SIZE,
  pivotSignupRows,
  type OtpSessionChallenge,
  type OtpSessionRow,
  type SignupPageEntry,
} from './format';

export interface OtpSessionListPage {
  rows: OtpSessionRow[];
  /** Distinct signup attempts, not challenge rows — one attempt has up to two. */
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Signup attempts in progress, most recently active first.
 *
 * Two steps rather than one join, because the unit of pagination is the signup
 * ATTEMPT and the rows are per CHANNEL: taking 20 challenge rows would cut an
 * attempt in half across the page seam and show an admin an email code whose
 * mobile counterpart is on the next page. So the first query pages the distinct
 * signupIds, and the second fetches every row belonging to that page.
 */
export async function listOtpSessions(page: number): Promise<OtpSessionListPage> {
  const skip = (page - 1) * OTP_SESSIONS_PAGE_SIZE;

  const [entries, totals] = await Promise.all([
    // The `"signupId" DESC` tiebreak is load-bearing, not decoration. Offset
    // pagination is only sound when the sort is a TOTAL order, and
    // max("lastSentAt") is not unique: the email and mobile codes for one
    // attempt are requested seconds apart, so two attempts running side by side
    // can easily share a max to the millisecond, and two attempts whose rows
    // were seeded in a single transaction certainly will. Without the tiebreak
    // Postgres is free to order such a pair differently between the page-1 and
    // page-2 queries, which drops one attempt and duplicates another across the
    // seam. Same reasoning, and the same fix, as listEmployers' `id` tiebreak.
    prisma.$queryRaw<SignupPageEntry[]>`
      SELECT "signupId", MAX("lastSentAt") AS "lastGeneratedAt"
      FROM "OtpChallenge"
      GROUP BY "signupId"
      ORDER BY MAX("lastSentAt") DESC, "signupId" DESC
      LIMIT ${OTP_SESSIONS_PAGE_SIZE}::int OFFSET ${skip}::int
    `,
    // ::int because COUNT returns bigint, which the driver would hand back as a
    // BigInt that JSON cannot serialise into the RSC payload. Same cast the
    // dashboard's counts use.
    prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(DISTINCT "signupId")::int AS "total" FROM "OtpChallenge"
    `,
  ]);

  const signupIds = entries.map((e) => e.signupId);

  // Prisma.join rejects an empty list, and there is nothing to ask for anyway.
  const challenges =
    signupIds.length === 0
      ? []
      : // "channel"::text because a raw query returns the Postgres enum as a
        // plain string rather than mapping it to the Prisma enum; the cast makes
        // that explicit instead of relying on the driver's default rendering.
        // The database's own enum constrains the value, which is what makes the
        // OtpChannel type on OtpSessionChallenge honest.
        await prisma.$queryRaw<OtpSessionChallenge[]>`
          SELECT "id",
                 "signupId",
                 "channel"::text AS "channel",
                 "destination",
                 "name",
                 "expiresAt",
                 -- Selected so a code whose five attempts are spent renders as
                 -- dead rather than as one more Reveal control. Without it the
                 -- console cannot see the difference; see deriveChallengeState.
                 "attempts",
                 "verifiedAt",
                 "lastSentAt"
          FROM "OtpChallenge"
          WHERE "signupId" IN (${Prisma.join(signupIds)})
        `;

  return {
    rows: pivotSignupRows(entries, challenges),
    // `?? 0` is unreachable in practice — a scalar aggregate always returns one
    // row — but noUncheckedIndexedAccess does not know that, and an empty table
    // legitimately counts zero.
    total: totals[0]?.total ?? 0,
    page,
    pageSize: OTP_SESSIONS_PAGE_SIZE,
  };
}
