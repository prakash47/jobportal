import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    company: { findMany: vi.fn() },
    city: { findMany: vi.fn() },
    skill: { findMany: vi.fn() },
    job: { findUnique: vi.fn() },
    savedJob: { findMany: vi.fn() },
    application: { findMany: vi.fn() },
  },
}));
vi.mock('@jobportal/search', () => ({ searchJobs: vi.fn() }));
vi.mock('@jobportal/domain/job-visibility', () => ({ canViewJob: vi.fn() }));

import { prisma } from '@jobportal/db';
import { searchJobs } from '@jobportal/search';
import { canViewJob } from '@jobportal/domain/job-visibility';
import { JobSlugRedirect, PublicJobsService } from './public-jobs.service';

const db = prisma as unknown as {
  company: { findMany: ReturnType<typeof vi.fn> };
  city: { findMany: ReturnType<typeof vi.fn> };
  skill: { findMany: ReturnType<typeof vi.fn> };
  job: { findUnique: ReturnType<typeof vi.fn> };
  savedJob: { findMany: ReturnType<typeof vi.fn> };
  application: { findMany: ReturnType<typeof vi.fn> };
};
const mockedSearch = searchJobs as unknown as ReturnType<typeof vi.fn>;
const mockedCanView = canViewJob as unknown as ReturnType<typeof vi.fn>;

const svc = new PublicJobsService();

function doc(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    canonicalSlug: 'a-job-1',
    title: 'A Job',
    description: 'd',
    shortDescription: 's',
    companyId: 7,
    companyName: 'Acme',
    companySlug: 'acme',
    skills: ['React'],
    skillSlugs: ['react'],
    skillIds: [1],
    citySlugs: ['pune'],
    cityIds: [3],
    primaryCitySlug: 'pune',
    industrySlug: null,
    industryId: null,
    functionalAreaSlug: null,
    status: 'ACTIVE',
    minExperienceMonths: 12,
    maxExperienceMonths: 60,
    salaryMin: 100,
    salaryMax: 200,
    postedAt: '2026-08-01T00:00:00.000Z',
    expiresAt: null,
    title_suggest: { input: [] },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedSearch.mockResolvedValue({ hits: [], total: 0 });
  db.company.findMany.mockResolvedValue([]);
  db.city.findMany.mockResolvedValue([]);
  db.skill.findMany.mockResolvedValue([]);
  db.savedJob.findMany.mockResolvedValue([]);
  db.application.findMany.mockResolvedValue([]);
  mockedCanView.mockResolvedValue(true);
});

describe('list', () => {
  it('PINS status to ACTIVE and fixes pageSize, whatever the caller sent', async () => {
    // The security property of the whole endpoint. searchJobs only DEFAULTS to
    // ACTIVE, so this must be set explicitly and must win.
    await svc.list({ q: 'x' } as never);
    expect(mockedSearch).toHaveBeenCalledOnce();
    const arg = mockedSearch.mock.calls[0]![0];
    expect(arg.status).toBe('ACTIVE');
    expect(arg.pageSize).toBe(20);
  });

  it('routes params through the SHARED parser, so years become months like the website', async () => {
    await svc.list({ expMin: 2, expMax: 5 } as never);
    const arg = mockedSearch.mock.calls[0]![0];
    expect(arg.minExperienceMonths).toBe(24);
    expect(arg.maxExperienceMonths).toBe(60);
  });

  it('passes skills and cities through as arrays', async () => {
    await svc.list({ skill: ['react', 'go'], city: 'pune' } as never);
    const arg = mockedSearch.mock.calls[0]![0];
    expect(arg.skillSlugs).toEqual(['react', 'go']);
    expect(arg.citySlugs).toEqual(['pune']);
  });

  // ADR 0002 decision 6. `list()` rebuilds a raw param object by hand, so a
  // param the DTO accepts is silently lost unless it is copied across —
  // exactly what happened to these two: the facets round-tripped through the
  // query string and never reached the parser.
  it('forwards emp/mode to the shared parser as ENUM values', async () => {
    await svc.list({ emp: 'INTERN', mode: ['on-site', 'remote'] } as never);
    const arg = mockedSearch.mock.calls[0]![0];
    expect(arg.employmentTypes).toEqual(['INTERN']);
    // `on-site` is the published URL spelling; ONSITE is the enum. The API
    // must land on the same value the website does.
    expect(arg.workModes).toEqual(['ONSITE', 'REMOTE']);
  });

  it('omits the facets entirely when the caller sends unknown values', async () => {
    await svc.list({ emp: 'BOGUS', mode: 'teleport' } as never);
    const arg = mockedSearch.mock.calls[0]![0];
    expect(arg.employmentTypes).toBeUndefined();
    expect(arg.workModes).toBeUndefined();
  });

  it('echoes the requested page and defaults it to 1', async () => {
    expect((await svc.list({ page: 3 } as never)).page).toBe(3);
    expect((await svc.list({} as never)).page).toBe(1);
  });

  it('hydrates logo and city name in TWO batched queries, not per card', async () => {
    mockedSearch.mockResolvedValue({
      hits: [doc({ id: 1, companyId: 7 }), doc({ id: 2, companyId: 7 }), doc({ id: 3, companyId: 8 })],
      total: 3,
    });
    db.company.findMany.mockResolvedValue([
      { id: 7, logoUrl: 'https://cdn/7.png' },
      { id: 8, logoUrl: null },
    ]);
    db.city.findMany.mockResolvedValue([{ slug: 'pune', name: 'Pune' }]);

    const page = await svc.list({} as never);

    expect(db.company.findMany).toHaveBeenCalledOnce();
    expect(db.city.findMany).toHaveBeenCalledOnce();
    // deduped ids, not one lookup per hit
    expect(db.company.findMany.mock.calls[0]![0].where.id.in).toEqual([7, 8]);
    expect(page.hits[0]!.company.logoUrl).toBe('https://cdn/7.png');
    expect(page.hits[2]!.company.logoUrl).toBeNull();
    expect(page.hits[0]!.city).toBe('Pune');
  });

  it('de-slugifies a city the lookup misses, matching the web card fallback', async () => {
    mockedSearch.mockResolvedValue({ hits: [doc({ primaryCitySlug: 'navi-mumbai' })], total: 1 });
    db.city.findMany.mockResolvedValue([]);
    const page = await svc.list({} as never);
    expect(page.hits[0]!.city).toBe('navi mumbai');
  });

  it('reports a null city when the job has none, without querying', async () => {
    mockedSearch.mockResolvedValue({ hits: [doc({ primaryCitySlug: null })], total: 1 });
    const page = await svc.list({} as never);
    expect(page.hits[0]!.city).toBeNull();
    expect(db.city.findMany).not.toHaveBeenCalled();
  });

  it('skips both joins entirely on an empty result set', async () => {
    const page = await svc.list({} as never);
    expect(page.hits).toEqual([]);
    expect(db.company.findMany).not.toHaveBeenCalled();
    expect(db.city.findMany).not.toHaveBeenCalled();
  });

  it('converts an Elasticsearch failure into a clean 503, never leaking its message', async () => {
    // An unwrapped @elastic/transport ResponseError carries statusCode +
    // message, which the global filter would have duck-typed as an http-error:
    // the caller would get ES's own status and raw exception text, and the
    // 4xx branch would skip Sentry, hiding a real outage.
    const esErr = Object.assign(new Error('search_phase_execution_exception: index missing'), {
      statusCode: 400,
    });
    mockedSearch.mockRejectedValue(esErr);

    const err = await svc.list({} as never).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    const thrown = err as ServiceUnavailableException;
    expect(thrown.getStatus()).toBe(503);
    expect(JSON.stringify(thrown.getResponse())).not.toContain('search_phase_execution_exception');
    // The original survives as `cause`, so the detail reaches our logs and
    // Sentry without reaching the client.
    expect((thrown.cause as Error | undefined)?.message).toContain('search_phase_execution_exception');
  });

  it('returns salary in paise and experience in months, unformatted', async () => {
    mockedSearch.mockResolvedValue({ hits: [doc()], total: 1 });
    const hit = (await svc.list({} as never)).hits[0]!;
    expect(hit.salaryMin).toBe(100);
    expect(hit.minExperienceMonths).toBe(12);
    // no pre-formatted display strings leak into the contract
    expect(JSON.stringify(hit)).not.toContain('LPA');
  });
});

describe('detail', () => {
  const job = {
    id: 12,
    canonicalSlug: 'real-slug-12',
    title: 'T',
    description: 'd',
    descriptionMarkdown: null,
    shortDescription: null,
    status: 'ACTIVE',
    employmentType: 'FULL_TIME',
    workMode: 'ONSITE',
    postedAt: new Date('2026-08-01T00:00:00Z'),
    expiresAt: null,
    salaryMinPaise: 1,
    salaryMaxPaise: 2,
    experienceMinYears: 1,
    experienceMaxYears: 3,
    skillIds: [],
    cityIds: [],
    companyId: 5,
    postedById: 9,
    company: { name: 'Acme', slug: 'acme', logoUrl: null, websiteUrl: null },
    primaryCity: { name: 'Pune' },
    industry: null,
  };

  it('404s a slug with no trailing id, without touching the database', async () => {
    await expect(svc.detail('no-id-here', null)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.job.findUnique).not.toHaveBeenCalled();
  });

  it('404s an unknown id', async () => {
    db.job.findUnique.mockResolvedValue(null);
    await expect(svc.detail('gone-999', null)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s — never 403s — a job the viewer may not see', async () => {
    db.job.findUnique.mockResolvedValue({ ...job, status: 'PENDING_MODERATION' });
    mockedCanView.mockResolvedValue(false);
    await expect(svc.detail('real-slug-12', null)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('checks visibility BEFORE the redirect, so a wrong slug cannot leak the title', async () => {
    // The Location header of a 308 carries the real title-bearing slug. If the
    // redirect fired first, guessing an id would disclose an unapproved job's
    // title to an anonymous caller.
    db.job.findUnique.mockResolvedValue({ ...job, status: 'DRAFT' });
    mockedCanView.mockResolvedValue(false);
    const err = await svc.detail('guessed-prefix-12', null).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotFoundException);
    expect(err).not.toBeInstanceOf(JobSlugRedirect);
  });

  it('redirects a drifted slug once the viewer is allowed to see the job', async () => {
    db.job.findUnique.mockResolvedValue(job);
    const err = await svc.detail('old-slug-12', null).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JobSlugRedirect);
    expect((err as JobSlugRedirect).canonicalSlug).toBe('real-slug-12');
  });

  it('returns the job when the slug is already canonical', async () => {
    db.job.findUnique.mockResolvedValue(job);
    const out = await svc.detail('real-slug-12', null);
    expect(out.id).toBe(12);
    expect(out.canonicalSlug).toBe('real-slug-12');
  });

  it('falls back to the primary city when cityIds is empty', async () => {
    db.job.findUnique.mockResolvedValue(job);
    const out = await svc.detail('real-slug-12', null);
    expect(out.cities).toEqual(['Pune']);
    expect(db.city.findMany).not.toHaveBeenCalled();
  });

  it('reports an empty city list when there is no city at all', async () => {
    db.job.findUnique.mockResolvedValue({ ...job, primaryCity: null });
    const out = await svc.detail('real-slug-12', null);
    expect(out.cities).toEqual([]);
  });

  it('serializes dates as ISO strings', async () => {
    db.job.findUnique.mockResolvedValue({ ...job, expiresAt: new Date('2026-09-01T00:00:00Z') });
    const out = await svc.detail('real-slug-12', null);
    expect(out.postedAt).toBe('2026-08-01T00:00:00.000Z');
    expect(out.expiresAt).toBe('2026-09-01T00:00:00.000Z');
  });

  it('never leaks postedById or other internal columns', async () => {
    db.job.findUnique.mockResolvedValue(job);
    const out = await svc.detail('real-slug-12', null);
    expect(Object.keys(out)).not.toContain('postedById');
  });
});

describe('jobState', () => {
  it('returns saved ids and a jobId -> status map', async () => {
    db.savedJob.findMany.mockResolvedValue([{ jobId: 1 }, { jobId: 3 }]);
    db.application.findMany.mockResolvedValue([{ jobId: 3, status: 'SHORTLISTED' }]);
    const out = await svc.jobState(42, [1, 2, 3]);
    expect(out.saved).toEqual([1, 3]);
    expect(out.applied).toEqual({ '3': 'SHORTLISTED' });
  });

  it('scopes BOTH queries to the calling user', async () => {
    await svc.jobState(42, [1, 2]);
    expect(db.savedJob.findMany.mock.calls[0]![0].where.userId).toBe(42);
    expect(db.application.findMany.mock.calls[0]![0].where.userId).toBe(42);
  });

  it('returns empty structures rather than nulls when nothing matches', async () => {
    const out = await svc.jobState(42, [9]);
    expect(out.saved).toEqual([]);
    expect(out.applied).toEqual({});
  });
});
