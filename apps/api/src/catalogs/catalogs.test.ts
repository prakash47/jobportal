import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    skill: { findMany: vi.fn(), count: vi.fn() },
    city: { findMany: vi.fn(), count: vi.fn() },
    industry: { findMany: vi.fn(), count: vi.fn() },
  },
}));

import { prisma } from '@jobportal/db';
import { CatalogsService } from './catalogs.service';
import { CatalogQueryDto, MAX_IDS, MAX_PAGE_SIZE } from './dto';

const db = prisma as unknown as {
  skill: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  city: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  industry: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
};

const svc = new CatalogsService();

beforeEach(() => {
  vi.clearAllMocks();
  for (const t of [db.skill, db.city, db.industry]) {
    t.findMany.mockResolvedValue([]);
    t.count.mockResolvedValue(0);
  }
});

describe('CatalogQueryDto', () => {
  it('accepts an empty query', () => {
    expect(CatalogQueryDto.safeParse({}).success).toBe(true);
  });

  it('caps pageSize — these are pickers, but the Skill table grows at runtime', () => {
    expect(CatalogQueryDto.safeParse({ pageSize: String(MAX_PAGE_SIZE) }).success).toBe(true);
    expect(CatalogQueryDto.safeParse({ pageSize: String(MAX_PAGE_SIZE + 1) }).success).toBe(false);
    expect(CatalogQueryDto.safeParse({ pageSize: '0' }).success).toBe(false);
  });

  it('parses ids into a de-duplicated number array', () => {
    const r = CatalogQueryDto.safeParse({ ids: '3, 17,3 , 42' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.ids).toEqual([3, 17, 42]);
  });

  it('rejects non-numeric, zero, negative and over-cap id lists', () => {
    expect(CatalogQueryDto.safeParse({ ids: 'abc' }).success).toBe(false);
    expect(CatalogQueryDto.safeParse({ ids: '1,x' }).success).toBe(false);
    expect(CatalogQueryDto.safeParse({ ids: '0' }).success).toBe(false);
    expect(CatalogQueryDto.safeParse({ ids: '-4' }).success).toBe(false);
    expect(CatalogQueryDto.safeParse({ ids: '1.5' }).success).toBe(false);
    const tooMany = Array.from({ length: MAX_IDS + 1 }, (_, i) => i + 1).join(',');
    expect(CatalogQueryDto.safeParse({ ids: tooMany }).success).toBe(false);
  });

  it('rejects unknown params rather than ignoring them', () => {
    expect(CatalogQueryDto.safeParse({ nope: '1' }).success).toBe(false);
  });

  it('rejects ids beyond the int4 ceiling — they made Prisma throw a public 500', () => {
    // These id columns are Prisma `Int`. A larger value does not match zero
    // rows, it THROWS inside findMany, so one extra digit in a URL produced a
    // 500 and a Sentry event on an unauthenticated route.
    expect(CatalogQueryDto.safeParse({ ids: '2147483647' }).success).toBe(true);
    expect(CatalogQueryDto.safeParse({ ids: '2147483648' }).success).toBe(false);
    expect(CatalogQueryDto.safeParse({ ids: '1,3000000000' }).success).toBe(false);
    // Number.isInteger(1e10) is true, so the exponent form slipped through the
    // old digit check.
    expect(CatalogQueryDto.safeParse({ ids: '1e10' }).success).toBe(false);
  });

  it('trims q and rejects a blank one', () => {
    const r = CatalogQueryDto.safeParse({ q: '  react  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.q).toBe('react');
    expect(CatalogQueryDto.safeParse({ q: '   ' }).success).toBe(false);
  });
});

describe('CatalogsService — listing', () => {
  it('defaults to page 1 size 20 and reports the table total', async () => {
    db.skill.findMany.mockResolvedValue([{ id: 1, slug: 'go', name: 'Go', category: null }]);
    db.skill.count.mockResolvedValue(161);
    const out = await svc.skills({});
    expect(out).toEqual({
      hits: [{ id: 1, slug: 'go', name: 'Go', category: null }],
      total: 161,
      page: 1,
      pageSize: 20,
    });
  });

  it('computes skip/take from page and pageSize', async () => {
    await svc.skills({ page: 3, pageSize: 50 });
    const args = db.skill.findMany.mock.calls[0]![0];
    expect(args.skip).toBe(100);
    expect(args.take).toBe(50);
  });

  it('searches case-insensitively on name — "bang" must match "Bangalore"', async () => {
    await svc.cities({ q: 'bang' });
    const args = db.city.findMany.mock.calls[0]![0];
    expect(args.where).toEqual({ name: { contains: 'bang', mode: 'insensitive' } });
  });

  it('applies no filter when q is absent', async () => {
    await svc.industries({});
    expect(db.industry.findMany.mock.calls[0]![0].where).toEqual({});
  });

  it('counts with the SAME where as the page, so total matches the filter', async () => {
    await svc.skills({ q: 'react' });
    expect(db.skill.findMany.mock.calls[0]![0].where).toEqual(
      db.skill.count.mock.calls[0]![0].where,
    );
  });

  it('orders by name with an id tiebreaker on all three — names are not unique', async () => {
    // Offset pagination over a non-unique sort key can drop or repeat a row at
    // the page seam; two cities really can share a name across states.
    await svc.skills({});
    await svc.cities({});
    await svc.industries({});
    for (const t of [db.skill, db.city, db.industry]) {
      expect(t.findMany.mock.calls[0]![0].orderBy).toEqual([{ name: 'asc' }, { id: 'asc' }]);
    }
  });

  it('selects only the picker fields — no createdAt, no isCustom', async () => {
    await svc.skills({});
    expect(db.skill.findMany.mock.calls[0]![0].select).toEqual({
      id: true,
      slug: true,
      name: true,
      category: true,
    });
    await svc.cities({});
    expect(db.city.findMany.mock.calls[0]![0].select).toEqual({
      id: true,
      slug: true,
      name: true,
      state: true,
    });
  });

  it('does NOT filter out custom skills — the web pickers load them too', async () => {
    await svc.skills({});
    expect(JSON.stringify(db.skill.findMany.mock.calls[0]![0].where)).not.toContain('isCustom');
  });
});

describe('CatalogsService — ids resolve mode', () => {
  it('looks up exactly the requested ids and never counts the table', async () => {
    db.skill.findMany.mockResolvedValue([
      { id: 7, slug: 'go', name: 'Go', category: null },
      { id: 62, slug: 'kafka', name: 'Kafka', category: null },
    ]);
    const out = await svc.skills({ ids: [7, 62] });
    expect(db.skill.findMany.mock.calls[0]![0].where).toEqual({ id: { in: [7, 62] } });
    expect(db.skill.count).not.toHaveBeenCalled();
    expect(out.total).toBe(2);
  });

  it('ignores q and page in resolve mode — a lookup must not be paginated away', async () => {
    // Silently paginating a resolve would drop ids the caller asked about,
    // leaving a profile screen with missing chips and no way to tell.
    db.city.findMany.mockResolvedValue([{ id: 1, slug: 'bangalore', name: 'Bangalore', state: 'KA' }]);
    const out = await svc.cities({ ids: [1], q: 'zzz', page: 9, pageSize: 1 });
    const args = db.city.findMany.mock.calls[0]![0];
    expect(args.where).toEqual({ id: { in: [1] } });
    expect(args.skip).toBeUndefined();
    expect(args.take).toBeUndefined();
    expect(out.page).toBe(1);
  });

  it('omits an id that no longer exists rather than 404ing the whole request', async () => {
    // A stale skill id on an old profile must not make the profile
    // unrenderable.
    db.skill.findMany.mockResolvedValue([{ id: 7, slug: 'go', name: 'Go', category: null }]);
    const out = await svc.skills({ ids: [7, 99999] });
    expect(out.hits).toHaveLength(1);
    expect(out.total).toBe(1);
  });

  it('resolves industries too, so the profile screen can label all three', async () => {
    db.industry.findMany.mockResolvedValue([{ id: 2, slug: 'it', name: 'IT' }]);
    const out = await svc.industries({ ids: [2] });
    expect(out.hits[0]!.name).toBe('IT');
  });
});
