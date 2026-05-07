import { prisma } from '@jobportal/db';
import type { Actor, EvaluationContext, EvaluationResult, FeatureFlag, FlagPatch } from './types';
import { evaluate } from './evaluator';
import { invalidateFlag, readCachedFlag, writeCachedFlag } from './cache';
import { writeFlagAuditLog } from './audit';
import { notifyCriticalChange } from './notify';

async function loadFlag(key: string): Promise<FeatureFlag | null> {
  const cached = await readCachedFlag(key);
  if (cached !== undefined) return cached;
  const dbFlag = (await prisma.featureFlag.findUnique({ where: { key } })) as FeatureFlag | null;
  await writeCachedFlag(key, dbFlag);
  return dbFlag;
}

async function hasAdminGrant(userId: number, featureKey: string): Promise<boolean> {
  const grant = await prisma.userEntitlement.findUnique({
    where: { userId_featureKey: { userId, featureKey } },
  });
  if (!grant || grant.source !== 'ADMIN_GRANT') return false;
  if (grant.expiresAt && grant.expiresAt <= new Date()) return false;
  return true;
}

export async function evaluateFlag(
  key: string,
  ctx: EvaluationContext = {},
): Promise<EvaluationResult> {
  // Step 1 of SRS §7.5 — admin grant always wins.
  if (ctx.userId !== undefined && (await hasAdminGrant(ctx.userId, key))) {
    return { enabled: true, reason: 'admin_grant' };
  }
  const flag = await loadFlag(key);
  return evaluate(flag, ctx);
}

export async function isFlagEnabled(
  key: string,
  ctx: EvaluationContext = {},
): Promise<boolean> {
  const result = await evaluateFlag(key, ctx);
  return result.enabled;
}

export async function listFlags(): Promise<FeatureFlag[]> {
  return prisma.featureFlag.findMany({
    orderBy: [{ category: 'asc' }, { key: 'asc' }],
  }) as unknown as Promise<FeatureFlag[]>;
}

export async function getFlag(key: string): Promise<FeatureFlag | null> {
  return loadFlag(key);
}

export async function setFlag(
  key: string,
  patch: FlagPatch,
  actor: Actor,
  reason?: string,
): Promise<FeatureFlag> {
  const before = (await prisma.featureFlag.findUnique({ where: { key } })) as FeatureFlag | null;
  if (!before) {
    throw new Error(`Unknown flag key: ${key}`);
  }

  const after = (await prisma.featureFlag.update({
    where: { key },
    data: {
      ...patch,
      lastChangedById: actor.userId,
    },
  })) as FeatureFlag;

  await Promise.all([
    writeFlagAuditLog(before, after, actor, reason),
    invalidateFlag(key),
    notifyCriticalChange(before, after, actor, reason),
  ]);

  return after;
}
