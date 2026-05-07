import { prisma, type Prisma } from '@jobportal/db';
import type { Actor, FeatureFlag } from './types';

// Convert a Prisma row into a Json-compatible value for the FlagAuditLog
// `before` / `after` columns. The DB column is jsonb; Prisma's typed input
// is `Prisma.InputJsonValue`. JSON.parse(JSON.stringify(...)) produces a
// plain object that satisfies that contract — Date fields serialize to ISO
// strings, BigInts would throw (we don't have any here).
function toJson(flag: FeatureFlag | null): Prisma.InputJsonValue {
  if (flag === null) return {};
  return JSON.parse(JSON.stringify(flag)) as Prisma.InputJsonValue;
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
