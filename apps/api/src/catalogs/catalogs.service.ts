import { Injectable } from '@nestjs/common';
import { prisma } from '@jobportal/db';
import { DEFAULT_PAGE_SIZE, type CatalogQuery } from './dto';

export interface CatalogPage<T> {
  hits: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SkillItem {
  id: number;
  slug: string;
  name: string;
  category: string | null;
}
export interface CityItem {
  id: number;
  slug: string;
  name: string;
  state: string;
}
export interface IndustryItem {
  id: number;
  slug: string;
  name: string;
}

// The three reference tables the app needs for its filter sheets, its
// onboarding pickers, and — the reason these were promoted ahead of companies
// — its PROFILE screen, since GET /me/profile returns bare skillIds,
// preferredCityIds and industryId with no names attached.
//
// SORTING is `name asc` with an `id asc` tiebreaker on all three. The name
// alone is not unique (two cities can share a name across states), and offset
// pagination over a non-unique sort key can drop or repeat a row at the page
// seam — the same reasoning the companies directory already documents.
//
// NO VISIBILITY GATE, deliberately: none of these tables has a status,
// published or soft-delete column, and the website already renders all of them
// publicly (SEO landing pages, the sitemap, the onboarding wizard). That
// includes `Skill.isCustom` rows created by users typing their own skill —
// the SSR pickers load those too, and filtering them here would silently
// diverge from the website. Worth a product conversation later if junk custom
// skills accumulate; it is not a decision to take unilaterally inside an API
// that is supposed to mirror the site.
@Injectable()
export class CatalogsService {
  async skills(query: CatalogQuery): Promise<CatalogPage<SkillItem>> {
    const select = { id: true, slug: true, name: true, category: true } as const;
    if (query.ids) {
      const hits = await prisma.skill.findMany({
        where: { id: { in: query.ids } },
        select,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
      return this.resolved(hits);
    }
    const { where, skip, take, page, pageSize } = this.listArgs(query);
    const [hits, total] = await Promise.all([
      prisma.skill.findMany({ where, select, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip, take }),
      prisma.skill.count({ where }),
    ]);
    return { hits, total, page, pageSize };
  }

  async cities(query: CatalogQuery): Promise<CatalogPage<CityItem>> {
    const select = { id: true, slug: true, name: true, state: true } as const;
    if (query.ids) {
      const hits = await prisma.city.findMany({
        where: { id: { in: query.ids } },
        select,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
      return this.resolved(hits);
    }
    const { where, skip, take, page, pageSize } = this.listArgs(query);
    const [hits, total] = await Promise.all([
      prisma.city.findMany({ where, select, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip, take }),
      prisma.city.count({ where }),
    ]);
    return { hits, total, page, pageSize };
  }

  async industries(query: CatalogQuery): Promise<CatalogPage<IndustryItem>> {
    const select = { id: true, slug: true, name: true } as const;
    if (query.ids) {
      const hits = await prisma.industry.findMany({
        where: { id: { in: query.ids } },
        select,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
      return this.resolved(hits);
    }
    const { where, skip, take, page, pageSize } = this.listArgs(query);
    const [hits, total] = await Promise.all([
      prisma.industry.findMany({
        where,
        select,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip,
        take,
      }),
      prisma.industry.count({ where }),
    ]);
    return { hits, total, page, pageSize };
  }

  // Resolve mode returns exactly what was found, with total = the number of
  // rows returned rather than a table count. An id that no longer exists is
  // simply absent — the caller asked "what are these?", and a 404 for one dead
  // id would make a stale profile unrenderable.
  private resolved<T>(hits: T[]): CatalogPage<T> {
    return { hits, total: hits.length, page: 1, pageSize: hits.length };
  }

  private listArgs(query: CatalogQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    // `mode: 'insensitive'` so "bang" matches "Bangalore" — Postgres LIKE is
    // case-sensitive by default and a picker that only matched exact casing
    // would read as broken.
    const where = query.q
      ? { name: { contains: query.q, mode: 'insensitive' as const } }
      : {};
    return { where, skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
  }
}
