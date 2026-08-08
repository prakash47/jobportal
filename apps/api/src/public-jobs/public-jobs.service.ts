import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@jobportal/db';
import { searchJobs } from '@jobportal/search';
import { parseSrpSearchParams } from '@jobportal/domain/srp-params';
import { parseJobSlug } from '@jobportal/domain/slug';
import { canViewJob } from '@jobportal/domain/job-visibility';
import type { AccessClaims } from '@jobportal/auth';
import type { ListJobsQuery } from './dto';

// Fixed server-side, matching the SSR's PAGE_SIZE and /me/saved-jobs. Not
// client-settable — see dto.ts.
export const PAGE_SIZE = 20;

export interface JobListItem {
  id: number;
  title: string;
  canonicalSlug: string;
  company: { id: number; name: string; slug: string; logoUrl: string | null };
  city: string | null;
  citySlug: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  minExperienceMonths: number | null;
  maxExperienceMonths: number | null;
  skills: string[];
  postedAt: string;
  shortDescription: string | null;
}

export interface JobListPage {
  hits: JobListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface JobDetail {
  id: number;
  canonicalSlug: string;
  title: string;
  description: string;
  descriptionMarkdown: string | null;
  shortDescription: string | null;
  status: string;
  employmentType: string;
  workMode: string;
  postedAt: string;
  expiresAt: string | null;
  salaryMinPaise: number | null;
  salaryMaxPaise: number | null;
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  cities: string[];
  skills: { id: number; slug: string; name: string }[];
  company: {
    id: number;
    name: string;
    slug: string;
    logoUrl: string | null;
    websiteUrl: string | null;
  };
  industry: { slug: string; name: string } | null;
}

/** Thrown when the slug does not match the job's canonical form. */
export class JobSlugRedirect extends Error {
  constructor(public readonly canonicalSlug: string) {
    super('canonical slug redirect');
  }
}

@Injectable()
export class PublicJobsService {
  /**
   * Paginated ACTIVE-only job search.
   *
   * The ES query itself is NOT re-implemented — `searchJobs` from
   * @jobportal/search is the same function the website's SRP calls, and the
   * API already depended on it for the alerts worker. Param mapping likewise
   * goes through the shared `parseSrpSearchParams`, so "expMin=2" means the
   * identical thing on both surfaces.
   */
  async list(query: ListJobsQuery): Promise<JobListPage> {
    // Rebuild the raw-ish shape the shared parser expects. Numbers go back to
    // strings because that parser is the URL-layer contract and owns the
    // coercion; duplicating its rules here is exactly the drift this package
    // exists to prevent.
    const raw: Record<string, string | string[] | undefined> = {};
    if (query.q !== undefined) raw['q'] = query.q;
    if (query.skill !== undefined) raw['skill'] = query.skill;
    if (query.city !== undefined) raw['city'] = query.city;
    if (query.industry !== undefined) raw['industry'] = query.industry;
    if (query.expMin !== undefined) raw['expMin'] = String(query.expMin);
    if (query.expMax !== undefined) raw['expMax'] = String(query.expMax);
    if (query.salaryMin !== undefined) raw['salaryMin'] = String(query.salaryMin);
    if (query.postedWithin !== undefined) raw['postedWithin'] = query.postedWithin;
    if (query.sort !== undefined) raw['sort'] = query.sort;
    if (query.page !== undefined) raw['page'] = String(query.page);

    const params = parseSrpSearchParams(raw);

    const results = await searchJobs({
      ...params,
      // Pinned AFTER the spread so a future parser change (or a crafted param
      // that slipped through) can never surface DRAFT or PENDING_MODERATION
      // documents on a public endpoint. searchJobs only DEFAULTS to ACTIVE.
      status: 'ACTIVE',
      pageSize: PAGE_SIZE,
    });

    return {
      hits: await this.hydrate(results.hits),
      total: results.total,
      page: params.page ?? 1,
      pageSize: PAGE_SIZE,
    };
  }

  /**
   * The two batched joins the SSR does (SrpShell), replicated exactly.
   *
   * The ES doc stores `companyId` and `primaryCitySlug` only — never a logo or
   * a city display name. Resolving them per card would be 40 queries a page;
   * these are two, keyed by the visible hits.
   */
  private async hydrate(
    hits: Awaited<ReturnType<typeof searchJobs>>['hits'],
  ): Promise<JobListItem[]> {
    const companyIds = [...new Set(hits.map((j) => j.companyId))];
    const citySlugs = [
      ...new Set(hits.flatMap((j) => (j.primaryCitySlug ? [j.primaryCitySlug] : []))),
    ];

    const [companies, cityRows] = await Promise.all([
      companyIds.length > 0
        ? prisma.company.findMany({
            where: { id: { in: companyIds } },
            select: { id: true, logoUrl: true },
          })
        : Promise.resolve<{ id: number; logoUrl: string | null }[]>([]),
      citySlugs.length > 0
        ? prisma.city.findMany({
            where: { slug: { in: citySlugs } },
            select: { slug: true, name: true },
          })
        : Promise.resolve<{ slug: string; name: string }[]>([]),
    ]);

    const logoByCompanyId = new Map(companies.map((c) => [c.id, c.logoUrl]));
    const cityNameBySlug = new Map(cityRows.map((c) => [c.slug, c.name]));

    return hits.map((j) => ({
      id: j.id,
      title: j.title,
      canonicalSlug: j.canonicalSlug,
      company: {
        id: j.companyId,
        name: j.companyName,
        slug: j.companySlug,
        logoUrl: logoByCompanyId.get(j.companyId) ?? null,
      },
      // Same fallback the web card uses: de-slugify when the lookup misses,
      // so a city removed between index and read still reads as a place name
      // rather than vanishing.
      city: j.primaryCitySlug
        ? (cityNameBySlug.get(j.primaryCitySlug) ?? j.primaryCitySlug.replaceAll('-', ' '))
        : null,
      citySlug: j.primaryCitySlug,
      salaryMin: j.salaryMin,
      salaryMax: j.salaryMax,
      minExperienceMonths: j.minExperienceMonths,
      maxExperienceMonths: j.maxExperienceMonths,
      skills: j.skills,
      postedAt: j.postedAt,
      shortDescription: j.shortDescription,
    }));
  }

  /**
   * Job detail by permalink slug.
   *
   * ORDERING IS LOAD-BEARING: the visibility check runs BEFORE the canonical
   * redirect. The 308's Location header carries the real, title-bearing slug,
   * so redirecting first would disclose an unapproved job's title to anyone
   * who guessed its id — the review of the web page caught exactly this.
   *
   * Throws NotFoundException for a malformed slug, an unknown id, and a job
   * the viewer may not see. All three are byte-identical on purpose: a
   * distinguishable 403 would confirm the posting exists.
   */
  async detail(slug: string, user: AccessClaims | null): Promise<JobDetail> {
    const parsed = parseJobSlug(slug);
    if (!parsed) throw new NotFoundException('Job not found');

    const job = await prisma.job.findUnique({
      where: { id: parsed.id },
      include: {
        company: { select: { name: true, slug: true, logoUrl: true, websiteUrl: true } },
        primaryCity: { select: { name: true } },
        industry: { select: { slug: true, name: true } },
      },
    });
    if (!job) throw new NotFoundException('Job not found');

    if (!(await canViewJob(user, job))) throw new NotFoundException('Job not found');

    if (job.canonicalSlug !== slug) throw new JobSlugRedirect(job.canonicalSlug);

    const [skills, cities] = await Promise.all([
      job.skillIds.length > 0
        ? prisma.skill.findMany({
            where: { id: { in: job.skillIds } },
            select: { id: true, slug: true, name: true },
          })
        : Promise.resolve<{ id: number; slug: string; name: string }[]>([]),
      job.cityIds.length > 0
        ? prisma.city.findMany({ where: { id: { in: job.cityIds } }, select: { name: true } })
        : Promise.resolve<{ name: string }[]>([]),
    ]);

    // Same fallback as the page: an empty cityIds falls back to the primary
    // city, and a job with neither reports an empty list rather than null.
    const cityNames =
      cities.length > 0
        ? cities.map((c) => c.name)
        : job.primaryCity
          ? [job.primaryCity.name]
          : [];

    return {
      id: job.id,
      canonicalSlug: job.canonicalSlug,
      title: job.title,
      description: job.description,
      descriptionMarkdown: job.descriptionMarkdown,
      shortDescription: job.shortDescription,
      status: job.status,
      employmentType: job.employmentType,
      workMode: job.workMode,
      postedAt: job.postedAt.toISOString(),
      expiresAt: job.expiresAt ? job.expiresAt.toISOString() : null,
      // Postgres names these *Paise / *Years; the Elasticsearch doc used by
      // the list endpoint calls the same two salary columns salaryMin/Max.
      // Both are paise — the response keeps the explicit unit suffix so a
      // client can never mistake them for rupees.
      salaryMinPaise: job.salaryMinPaise,
      salaryMaxPaise: job.salaryMaxPaise,
      experienceMinYears: job.experienceMinYears,
      experienceMaxYears: job.experienceMaxYears,
      cities: cityNames,
      skills,
      company: {
        id: job.companyId,
        name: job.company.name,
        slug: job.company.slug,
        logoUrl: job.company.logoUrl,
        websiteUrl: job.company.websiteUrl,
      },
      industry: job.industry ? { slug: job.industry.slug, name: job.industry.name } : null,
    };
  }

  /**
   * Bulk saved/applied lookup for a list of job ids.
   *
   * Ships alongside /v1/jobs because without it a 20-card page needs 20 extra
   * round trips to draw its save icons — and adding it later would change the
   * list response shape after clients had been written against it.
   *
   * Scoped strictly to the caller: two queries over their own rows, never a
   * scan of anyone else's.
   */
  async jobState(
    userId: number,
    jobIds: number[],
  ): Promise<{ saved: number[]; applied: Record<string, string> }> {
    const [saved, applications] = await Promise.all([
      prisma.savedJob.findMany({
        where: { userId, jobId: { in: jobIds } },
        select: { jobId: true },
      }),
      prisma.application.findMany({
        where: { userId, jobId: { in: jobIds } },
        select: { jobId: true, status: true },
      }),
    ]);

    const applied: Record<string, string> = {};
    for (const a of applications) applied[String(a.jobId)] = a.status;

    return { saved: saved.map((s) => s.jobId), applied };
  }
}
