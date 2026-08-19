import { Prisma, type BroadcastSegment } from '@jobportal/db';

/**
 * Who a broadcast segment actually resolves to.
 *
 * ⚠ THIS FILE IS THE SINGLE DEFINITION AND THAT IS THE POINT. Three separate
 * things ask "who is in this segment": the console's pre-send count preview, the
 * count recorded on the audit row at dispatch, and the planner that writes the
 * recipient ledger. If any of them re-implemented the predicate, the number an
 * admin approved would stop matching the number of people who received the
 * message — and nobody ever cross-checks those two, so the divergence would be
 * invisible indefinitely. This is the same reasoning `@jobportal/domain/txn-log-params`
 * records for the transactions console and its CSV export.
 *
 * It lives in apps/api rather than packages/domain because, unlike that case,
 * both consumers are in apps/api: the sadmin console reads these numbers through
 * the AdminGuard'd endpoints rather than querying Postgres itself.
 */

/**
 * The email audience.
 *
 * Three decisions are encoded here, none of them incidental:
 *
 * 1. **Deactivated recruiters are excluded.** `Recruiter.deactivatedAt` is a
 *    soft-remove whose sessions are revoked and who is blocked from
 *    re-authenticating. Mailing them a platform announcement invites someone who
 *    demonstrably cannot sign in to go and try. Note the existing
 *    `notifyKycDecision` fan-out does NOT filter this and so already notifies
 *    removed teammates — that is a bug to avoid copying, not a precedent.
 *
 * 2. **ADMIN accounts are excluded from every segment**, including ALL_USERS.
 *    Staff receiving the platform's own announcements as if they were customers
 *    is noise, and the dashboard's signup series already excludes ADMIN for the
 *    same reason ("internal staff logins are not signups"). Staff who want to see
 *    the message have the console it was written in.
 *
 * 3. **`emailVerified` is deliberately NOT required.** An unverified user still
 *    supplied a working address at signup, and an operational notice — "we are
 *    down for maintenance tonight" — is exactly the kind of message someone
 *    mid-signup still needs. Requiring verification would silently shrink every
 *    segment with no signal on screen.
 *
 * A `User` whose role is RECRUITER but who has no `Recruiter` row is excluded by
 * the relation filter. That is intentional: such a user cannot reach any
 * recruiter surface, so there is nothing for an announcement to be about.
 */
export function broadcastEmailWhere(segment: BroadcastSegment): Prisma.UserWhereInput {
  switch (segment) {
    case 'ALL_CANDIDATES':
      return { role: 'CANDIDATE' };
    case 'ALL_RECRUITERS':
      return { role: 'RECRUITER', recruiter: { deactivatedAt: null } };
    case 'ALL_USERS':
      // Not `role: { in: [...] }` — a recruiter still has to clear the
      // deactivation filter, and an OR of the two fully-formed predicates is the
      // only shape that says so without a second where-clause to keep in sync.
      return {
        OR: [{ role: 'CANDIDATE' }, { role: 'RECRUITER', recruiter: { deactivatedAt: null } }],
      };
    default: {
      // Exhaustiveness: a new BroadcastSegment member is a compile error here
      // rather than a segment that silently resolves to "everyone".
      const never: never = segment;
      throw new Error(`Unhandled broadcast segment: ${String(never)}`);
    }
  }
}

/**
 * The in-app audience, which is NEVER simply the email audience.
 *
 * ⚠ In-app notifications reach RECRUITERS ONLY, whatever the segment says, and
 * this is a property of the product rather than a policy chosen here: `apps/web`
 * contains no bell, no feed and no read of the `Notification` table at all, so a
 * row addressed to a candidate would be written and then rendered nowhere. Every
 * `Bell` icon in the job-seeker site belongs to the unrelated Job Alerts email
 * feature.
 *
 * So this intersects the segment with "is an active recruiter". For
 * ALL_CANDIDATES that intersection is empty, which is why the DTO rejects the
 * combination outright instead of accepting a request that would do nothing —
 * an admin who ticks "in-app" on a candidate broadcast and sees it succeed has
 * been told something false.
 */
export function broadcastInAppWhere(segment: BroadcastSegment): Prisma.UserWhereInput | null {
  switch (segment) {
    case 'ALL_CANDIDATES':
      return null;
    case 'ALL_RECRUITERS':
    case 'ALL_USERS':
      return { role: 'RECRUITER', recruiter: { deactivatedAt: null } };
    default: {
      const never: never = segment;
      throw new Error(`Unhandled broadcast segment: ${String(never)}`);
    }
  }
}

/**
 * Whether an in-app broadcast to this segment can reach anybody at all.
 *
 * Exported separately from the where-builder so the DTO can reject the
 * impossible combination without constructing a query, and so the console can
 * explain it before the admin submits.
 */
export function segmentSupportsInApp(segment: BroadcastSegment): boolean {
  return broadcastInAppWhere(segment) !== null;
}
