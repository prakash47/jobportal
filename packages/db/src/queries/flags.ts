import type { FeatureFlag } from '../../generated/client';
import { prisma } from '../client';

export function getFlagByKey(key: string): Promise<FeatureFlag | null> {
  return prisma.featureFlag.findUnique({ where: { key } });
}

export function listAllFlags(): Promise<FeatureFlag[]> {
  return prisma.featureFlag.findMany({
    orderBy: [{ category: 'asc' }, { key: 'asc' }],
  });
}

export function listFlagsByCategory(category: string): Promise<FeatureFlag[]> {
  return prisma.featureFlag.findMany({
    where: { category },
    orderBy: { key: 'asc' },
  });
}

export function countEnabledFlags(): Promise<number> {
  return prisma.featureFlag.count({ where: { enabled: true } });
}
