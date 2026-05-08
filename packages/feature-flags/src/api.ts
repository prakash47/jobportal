import { prisma } from '@jobportal/db';
import type { Actor, EvaluationContext, EvaluationResult, FeatureFlag, FlagPatch } from './types';
import { evaluate } from './evaluator';
import { invalidateFlag, readCachedFlag, writeCachedFlag } from './cache';
import { writeFlagAuditLog } from './audit';
import { notifyCriticalChange } from './notify';

export interface AuditLogEntry {
  id: number;
  flagId: number;
  flagKey: string;
  flagUiLabel: string | null;
  changedAt: Date;
  changedBy: { id: number; name: string; email: string } | null;
  reason: string | null;
  before: unknown;
  after: unknown;
}

export interface AuditLogPage {
  hits: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

const AUDIT_LOG_PAGE_SIZE = 25;

export async function listAuditLog(opts: {
  page?: number;
  flagKey?: string;
} = {}): Promise<AuditLogPage> {
  const page = opts.page && opts.page >= 1 ? Math.floor(opts.page) : 1;
  // Resolve flagKey → flagId once so the WHERE clause stays an indexed
  // equality on flagId rather than a join-with-string-equality.
  let flagId: number | undefined;
  if (opts.flagKey) {
    const flag = await prisma.featureFlag.findUnique({
      where: { key: opts.flagKey },
      select: { id: true },
    });
    if (!flag) {
      // Unknown flag key → empty result rather than 404. The admin UI
      // sends whatever's in the URL bar; a leftover ?flagKey= for a
      // since-deleted flag should render an empty page, not error.
      return { hits: [], total: 0, page, pageSize: AUDIT_LOG_PAGE_SIZE };
    }
    flagId = flag.id;
  }

  const where = flagId !== undefined ? { flagId } : {};

  const [rows, total] = await Promise.all([
    prisma.flagAuditLog.findMany({
      where,
      orderBy: { changedAt: 'desc' },
      skip: (page - 1) * AUDIT_LOG_PAGE_SIZE,
      take: AUDIT_LOG_PAGE_SIZE,
      select: {
        id: true,
        flagId: true,
        changedAt: true,
        changedById: true,
        reason: true,
        before: true,
        after: true,
        flag: { select: { key: true, uiLabel: true } },
      },
    }),
    prisma.flagAuditLog.count({ where }),
  ]);

  // Hydrate the admin user separately so a deleted admin row (orphan
  // changedById) returns null rather than failing the whole query.
  const userIds = Array.from(
    new Set(rows.map((r) => r.changedById).filter((id): id is number => id !== null)),
  );
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  const hits: AuditLogEntry[] = rows.map((r) => ({
    id: r.id,
    flagId: r.flagId,
    flagKey: r.flag.key,
    flagUiLabel: r.flag.uiLabel,
    changedAt: r.changedAt,
    changedBy: r.changedById !== null ? userById.get(r.changedById) ?? null : null,
    reason: r.reason,
    before: r.before,
    after: r.after,
  }));

  return { hits, total, page, pageSize: AUDIT_LOG_PAGE_SIZE };
}

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
