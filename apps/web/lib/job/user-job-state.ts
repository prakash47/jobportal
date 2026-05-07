// SSR helpers that derive the per-user state for the apply/save buttons.
// Lookups go straight to Postgres via Prisma (no API hop) so the server
// component can render the correct button label without a hydration flash.
// The unique keys (userId,jobId) on Application and SavedJob make these
// O(1) index probes.

import { prisma } from '@jobportal/db';

export async function readApplied(userId: number, jobId: number): Promise<boolean> {
  const row = await prisma.application.findUnique({
    where: { userId_jobId: { userId, jobId } },
    select: { id: true },
  });
  return row !== null;
}

export async function readSaved(userId: number, jobId: number): Promise<boolean> {
  const row = await prisma.savedJob.findUnique({
    where: { userId_jobId: { userId, jobId } },
    select: { userId: true },
  });
  return row !== null;
}
