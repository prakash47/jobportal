// Per-page server-side helper that loads enough auth state for the SRP to
// render the JobCard save-toggle in its right state for the signed-in user
// without hammering the DB once per card. One cookie read + one batched
// SavedJob lookup keyed by the visible job ids.

import { prisma } from '@jobportal/db';
import { readUserFromCookie } from '../auth/server-session';

export interface SrpUserContext {
  isAuthed: boolean;
  savedJobIds: Set<number>;
}

export async function loadSrpUserContext(jobIds: number[]): Promise<SrpUserContext> {
  const user = await readUserFromCookie();
  if (!user || jobIds.length === 0) {
    return { isAuthed: user !== null, savedJobIds: new Set() };
  }
  const rows = await prisma.savedJob.findMany({
    where: { userId: user.sub, jobId: { in: jobIds } },
    select: { jobId: true },
  });
  return { isAuthed: true, savedJobIds: new Set(rows.map((r) => r.jobId)) };
}
