// Per-page server-side helper that loads enough auth state for the SRP to
// render the JobCard save-toggle in its right state for the signed-in user
// without hammering the DB once per card. One cookie read + one batched
// SavedJob lookup keyed by the visible job ids.

import { prisma } from '@jobportal/db';
import { readUserFromCookie } from '../auth/server-session';

export interface SrpUserContext {
  isAuthed: boolean;
  savedJobIds: Set<number>;
  /** jobId -> when the user applied, so a card can say "Applied 6d ago". */
  appliedAtByJobId: Map<number, string>;
}

export async function loadSrpUserContext(jobIds: number[]): Promise<SrpUserContext> {
  const user = await readUserFromCookie();
  if (!user || jobIds.length === 0) {
    return { isAuthed: user !== null, savedJobIds: new Set(), appliedAtByJobId: new Map() };
  }
  // Both lookups are batched over the visible job ids and run together — the
  // applied state costs one more query per page, not one per card.
  const [saved, applied] = await Promise.all([
    prisma.savedJob.findMany({
      where: { userId: user.sub, jobId: { in: jobIds } },
      select: { jobId: true },
    }),
    prisma.application.findMany({
      where: { userId: user.sub, jobId: { in: jobIds } },
      select: { jobId: true, appliedAt: true },
    }),
  ]);
  return {
    isAuthed: true,
    savedJobIds: new Set(saved.map((r) => r.jobId)),
    appliedAtByJobId: new Map(applied.map((r) => [r.jobId, r.appliedAt.toISOString()])),
  };
}
