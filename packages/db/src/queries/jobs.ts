import type { Job } from '../../generated/client';
import { prisma } from '../client';

export function getJobById(id: number): Promise<Job | null> {
  return prisma.job.findUnique({ where: { id } });
}

export function getJobBySlug(canonicalSlug: string): Promise<Job | null> {
  return prisma.job.findUnique({ where: { canonicalSlug } });
}

export function listActiveJobs(take = 20, skip = 0): Promise<Job[]> {
  return prisma.job.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { postedAt: 'desc' },
    take,
    skip,
  });
}

export function countActiveJobsByCompany(companyId: number): Promise<number> {
  return prisma.job.count({
    where: { companyId, status: 'ACTIVE' },
  });
}

export function listActiveJobsByCity(primaryCityId: number, take = 20, skip = 0): Promise<Job[]> {
  return prisma.job.findMany({
    where: { primaryCityId, status: 'ACTIVE' },
    orderBy: { postedAt: 'desc' },
    take,
    skip,
  });
}
