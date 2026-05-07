import type { Company } from '../../generated/client';
import { prisma } from '../client';

export function getCompanyById(id: number): Promise<Company | null> {
  return prisma.company.findUnique({ where: { id } });
}

export function getCompanyBySlug(slug: string): Promise<Company | null> {
  return prisma.company.findUnique({ where: { slug } });
}

export function listCompaniesByIndustry(industryId: number, take = 20): Promise<Company[]> {
  return prisma.company.findMany({
    where: { industryId },
    orderBy: { name: 'asc' },
    take,
  });
}

export function searchCompaniesByName(query: string, take = 20): Promise<Company[]> {
  return prisma.company.findMany({
    where: { name: { contains: query, mode: 'insensitive' } },
    orderBy: { name: 'asc' },
    take,
  });
}
