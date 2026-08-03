// Candidate Management reads.
//
// Reads/writes split (the repo's topology): this console is display-only, so
// every row comes straight from Postgres via Prisma inside the RSC — no BFF hop
// and no new API endpoint, the same call lib/employers/queries.ts and
// lib/dashboard/queries.ts make and for the same reason.
//
// ⚠ Anything that ever WRITES from this surface must move to apps/api so
// AdminGuard, Zod validation and audit logging all apply. That is not
// hypothetical here: the Actions column already renders View / Suspend / Delete
// as inert controls. Wiring any of them to a Prisma mutation or a server action
// in this file would bypass all three. (Suspend cannot be wired at all yet —
// there is no suspension column on User; see PROGRESS.md for what it needs.)

import { prisma } from '@jobportal/db';
import { CANDIDATES_PAGE_SIZE } from './format';

export interface CandidateListRow {
  id: number;
  /** User.name. NOT NULL in the schema, but may be an empty string. */
  name: string;
  email: string;
  /**
   * User.phone. Deliberately NOT normalised or unique in the schema, so this is
   * free-form text — display only, never a key to match rows on.
   */
  phone: string | null;
  /** User.image — an OAuth provider's avatar URL. Null for every other signup. */
  image: string | null;
  headline: string | null;
  currentTitle: string | null;
  /** Candidate.currentCityName — free text, with no link to the City catalogue. */
  location: string | null;
  /**
   * User.createdAt — when the ACCOUNT was created. Deliberately not
   * Candidate.createdAt, which is when the profile row was lazily provisioned:
   * that is a later instant, and it does not exist at all for a seeker who has
   * never opened /profile.
   */
  registeredAt: Date;
}

export interface CandidateListPage {
  rows: CandidateListRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * The candidate master list, newest signup first, optionally filtered by name or
 * email.
 *
 * ⚠ This queries `User`, NOT `Candidate`, and that is the single most important
 * decision in this file. The `Candidate` profile row is provisioned LAZILY on
 * the first /profile read — email+password registration creates only the `User`,
 * and the Google signup path swallows a failed `Candidate` create (both
 * documented at lib/dashboard/queries.ts). Driving off `Candidate` would
 * therefore SILENTLY OMIT real registered seekers from a list whose whole job is
 * to be complete, with no error to notice. The dashboard's "Job seekers" KPI
 * counts `user.count({ where: { role: 'CANDIDATE' } })` for the same reason, and
 * an existing test pins it. `candidate` is consequently a nullable relation
 * everywhere below.
 */
export async function listCandidates(page: number, q?: string): Promise<CandidateListPage> {
  // Built ONCE and handed to both queries by reference. The employer list gets
  // away with a bare count() because it has no filter; here a divergence between
  // the two where-clauses would make the total, the count line, the pagination
  // link count and the over-range redirect all disagree with the visible rows.
  //
  // `role` is indexed (@@index([role]) on User). The name/email `contains` arms
  // are not — see the note in the page's PR entry; fine at this scale, worth
  // revisiting with a trigram index long before it matters.
  const where = {
    role: 'CANDIDATE' as const,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { email: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      // `id` breaks ties deterministically. Offset pagination is only sound if
      // the sort is a total order: two users sharing a createdAt could otherwise
      // be ordered differently between the page-1 and page-2 queries, which
      // drops one row and duplicates another across the seam. createdAt alone is
      // not unique (nothing in the schema makes it so); `id` is. Seeded demo
      // candidates are inserted in a single batch, so equal timestamps are a
      // live possibility here rather than a theoretical one.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * CANDIDATES_PAGE_SIZE,
      take: CANDIDATES_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        image: true,
        createdAt: true,
        // Nullable relation — see the warning above.
        candidate: {
          select: { headline: true, currentTitle: true, currentCityName: true },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    rows: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      image: u.image,
      headline: u.candidate?.headline ?? null,
      currentTitle: u.candidate?.currentTitle ?? null,
      location: u.candidate?.currentCityName ?? null,
      registeredAt: u.createdAt,
    })),
    total,
    page,
    pageSize: CANDIDATES_PAGE_SIZE,
  };
}
