import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    company: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    industry: { findUnique: vi.fn() },
    job: { groupBy: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    companyReview: { findMany: vi.fn() },
  },
  Prisma: {},
}));

import { prisma } from '@jobportal/db';
import { CompanySlugRedirect, PublicCompaniesService } from './public-companies.service';
import { ListCompaniesQueryDto } from './dto';

const db = prisma as unknown as {
  company: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  industry: { findUnique: ReturnType<typeof vi.fn> };
  job: {
    groupBy: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  companyReview: { findMany: ReturnType<typeof vi.fn> };
};

const svc = new PublicCompaniesService();
const base = { category: null, sort: 'rating' as const, hiring: false, page: 1 };

const company = {
  id: 12,
  slug: 'sutra-labs',
  name: 'Sutra Labs',
  description: 'd',
  logoUrl: null,
  websiteUrl: null,
  companyType: 'STARTUP',
  workingAtSections: null,
  averageRating: 4.2,
  reviewCount: 9,
  employeeCount: '51-200',
  foundedYear: 2019,
  industryId: 4,
  industry: { name: 'IT / Software' },
  headquartersCity: { name: 'Bangalore' },
  kyc: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.company.findMany.mockResolvedValue([]);
  db.company.count.mockResolvedValue(0);
  db.company.findUnique.mockResolvedValue(company);
  db.industry.findUnique.mockResolvedValue(null);
  db.job.groupBy.mockResolvedValue([]);
  db.job.findMany.mockResolvedValue([]);
  db.job.count.mockResolvedValue(0);
  db.companyReview.findMany.mockResolvedValue([]);
});

describe('ListCompaniesQueryDto', () => {
  it('accepts the website\'s own param spellings', () => {
    expect(ListCompaniesQueryDto.safeParse({ sort: 'reviews', hiring: '1', page: '2' }).success).toBe(true);
    expect(ListCompaniesQueryDto.safeParse({ hiring: 'true' }).success).toBe(true);
  });

  it('rejects an unknown sort and unknown params', () => {
    expect(ListCompaniesQueryDto.safeParse({ sort: 'bogus' }).success).toBe(false);
    expect(ListCompaniesQueryDto.safeParse({ nope: '1' }).success).toBe(false);
  });
});

describe('list', () => {
  it('uses the SSR orderBy ladder, always ending in a unique id tiebreaker', async () => {
    // `name` is not unique; offset pagination over a non-unique sort key can
    // duplicate or drop the row on a page seam.
    await svc.list({ ...base, sort: 'rating' });
    expect(db.company.findMany.mock.calls[0]![0].orderBy).toEqual([
      { averageRating: { sort: 'desc', nulls: 'last' } },
      { name: 'asc' },
      { id: 'asc' },
    ]);
    vi.clearAllMocks();
    db.company.findMany.mockResolvedValue([]);
    db.company.count.mockResolvedValue(0);
    await svc.list({ ...base, sort: 'reviews' });
    expect(db.company.findMany.mock.calls[0]![0].orderBy).toEqual([
      { reviewCount: 'desc' },
      { name: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('page size is 20 — the API value, NOT the website grid\'s 24', async () => {
    const out = await svc.list(base);
    expect(out.pageSize).toBe(20);
    expect(db.company.findMany.mock.calls[0]![0].take).toBe(20);
  });

  it('IGNORES an unknown category rather than 404ing, matching the SSR', async () => {
    db.industry.findUnique.mockResolvedValue(null);
    await svc.list({ ...base, category: 'no-such-industry' });
    expect(db.company.findMany.mock.calls[0]![0].where).toEqual({});
  });

  it('filters by industry when the category resolves', async () => {
    db.industry.findUnique.mockResolvedValue({ id: 4 });
    await svc.list({ ...base, category: 'it-software' });
    expect(db.company.findMany.mock.calls[0]![0].where).toEqual({ industryId: 4 });
  });

  it('restricts to companies with a live role when hiring=true', async () => {
    await svc.list({ ...base, hiring: true });
    expect(db.company.findMany.mock.calls[0]![0].where).toEqual({
      jobs: { some: { status: 'ACTIVE' } },
    });
  });

  it('counts open roles in ONE grouped query for the page, never per card', async () => {
    db.company.findMany.mockResolvedValue([
      { id: 1, slug: 'a', name: 'A', logoUrl: null, averageRating: null, reviewCount: 0, industry: null, headquartersCity: null },
      { id: 2, slug: 'b', name: 'B', logoUrl: null, averageRating: null, reviewCount: 0, industry: null, headquartersCity: null },
    ]);
    db.company.count.mockResolvedValue(2);
    db.job.groupBy.mockResolvedValue([{ companyId: 1, _count: { _all: 7 } }]);

    const out = await svc.list(base);
    expect(db.job.groupBy).toHaveBeenCalledOnce();
    expect(out.hits[0]!.openRolesCount).toBe(7);
    // A company with no live roles reports 0 rather than undefined.
    expect(out.hits[1]!.openRolesCount).toBe(0);
  });

  it('skips the count query entirely when the page is empty', async () => {
    await svc.list(base);
    expect(db.job.groupBy).not.toHaveBeenCalled();
  });

  it('derives the handle so the client never has to build it', async () => {
    db.company.findMany.mockResolvedValue([
      { id: 12, slug: 'sutra-labs', name: 'Sutra Labs', logoUrl: null, averageRating: null, reviewCount: 0, industry: null, headquartersCity: null },
    ]);
    db.company.count.mockResolvedValue(1);
    expect((await svc.list(base)).hits[0]!.handle).toBe('sutra-labs-overview-12');
  });
});

describe('detail', () => {
  it('404s a malformed handle without touching the database', async () => {
    await expect(svc.detail('not-a-handle')).rejects.toBeInstanceOf(NotFoundException);
    expect(db.company.findUnique).not.toHaveBeenCalled();
  });

  it('404s an unknown id', async () => {
    db.company.findUnique.mockResolvedValue(null);
    await expect(svc.detail('x-overview-999')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('redirects a drifted handle to the canonical one', async () => {
    const err = await svc.detail('old-name-overview-12').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CompanySlugRedirect);
    expect((err as CompanySlugRedirect).handle).toBe('sutra-labs-overview-12');
  });

  it('checks existence BEFORE redirecting, so an unknown id cannot be probed', async () => {
    db.company.findUnique.mockResolvedValue(null);
    const err = await svc.detail('anything-overview-999').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotFoundException);
    expect(err).not.toBeInstanceOf(CompanySlugRedirect);
  });

  it('treats an ABSENT kyc row as unverified — most companies have none', async () => {
    expect((await svc.detail('sutra-labs-overview-12')).isVerified).toBe(false);
    db.company.findUnique.mockResolvedValue({ ...company, kyc: { status: 'PENDING' } });
    expect((await svc.detail('sutra-labs-overview-12')).isVerified).toBe(false);
    db.company.findUnique.mockResolvedValue({ ...company, kyc: { status: 'VERIFIED' } });
    expect((await svc.detail('sutra-labs-overview-12')).isVerified).toBe(true);
  });

  it('gates openings to ACTIVE and caps them at 10, newest first', async () => {
    await svc.detail('sutra-labs-overview-12');
    const args = db.job.findMany.mock.calls[0]![0];
    expect(args.where).toEqual({ companyId: 12, status: 'ACTIVE' });
    expect(args.take).toBe(10);
    expect(args.orderBy).toEqual({ postedAt: 'desc' });
  });

  it('renders a reviewer with no name as null so the client can say "Anonymous"', async () => {
    db.companyReview.findMany.mockResolvedValue([
      { id: 1, rating: 4, title: null, body: 'b', isVerified: false, createdAt: new Date('2026-07-20T00:00:00Z'), user: null },
    ]);
    const out = await svc.detail('sutra-labs-overview-12');
    expect(out.reviews[0]!.authorName).toBeNull();
    expect(out.reviews[0]!.createdAt).toBe('2026-07-20T00:00:00.000Z');
  });

  it('returns no related companies when the company has no industry', async () => {
    db.company.findUnique.mockResolvedValue({ ...company, industryId: null });
    const out = await svc.detail('sutra-labs-overview-12');
    expect(out.relatedCompanies).toEqual([]);
  });

  it('excludes the company itself from its own peers', async () => {
    db.company.findMany.mockResolvedValue([]);
    await svc.detail('sutra-labs-overview-12');
    expect(db.company.findMany.mock.calls[0]![0].where).toEqual({ industryId: 4, id: { not: 12 } });
  });

  it('parses highlights through the SHARED rule, dropping malformed blocks', async () => {
    db.company.findUnique.mockResolvedValue({
      ...company,
      workingAtSections: [
        { heading: 'Culture', body: 'Good' },
        { heading: '', body: 'no heading' },
        { heading: 'Perks', body: '   ' },
        'nonsense',
      ],
    });
    const out = await svc.detail('sutra-labs-overview-12');
    expect(out.highlights).toEqual([{ heading: 'Culture', body: 'Good' }]);
  });
});
