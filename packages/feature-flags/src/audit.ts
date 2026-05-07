import { prisma } from '@jobportal/db';
import type { Actor, FeatureFlag } from './types';

// Cast the Prisma row into a Json-compatible record. The DB column is jsonb;
// Prisma accepts plain objects. Date fields serialize to ISO strings.
function toJson(flag: FeatureFlag | null): Record<string, unknown> {
  if (flag === null) return {};
  return JSON.parse(JSON.stringify(flag)) as Record<string, unknown>;
}

export async function writeFlagAuditLog(
  before: FeatureFlag | null,
  after: FeatureFlag,
  actor: Actor,
  reason?: string,
): Promise<void> {
  await prisma.flagAuditLog.create({
    data: {
      flagId: after.id,
      before: toJson(before),
      after: toJson(after),
      changedById: actor.userId,
      reason: reason ?? null,
    },
  });
}
