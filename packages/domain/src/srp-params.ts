import type { SearchJobsParams } from '@jobportal/search';

// URL query-param shape for the SRP. Multi-select uses repeated keys
// (?skill=react&skill=typescript). Cities live in the path segment for
// the SEO routes; the ?city= param is for the generic /jobs page only.
export type SrpQuerySchema = {
  q?: string;
  skill?: string | string[];
  city?: string | string[];
  industry?: string;
  emp?: string | string[];
  mode?: string | string[];
  expMin?: string;
  expMax?: string;
  salaryMin?: string;
  postedWithin?: string;
  sort?: string;
  page?: string;
};

type RawParams = Record<string, string | string[] | undefined>;

function asString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function asArray(v: string | string[] | undefined): string[] | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v : [v];
}

// Reads URL search params and produces a typed SearchJobsParams suitable for
// passing into @jobportal/search.searchJobs(...). Path-based fields (skill
// from /[skill]-jobs, cities from /jobs-in-[city]) are merged in by the
// route handler before the call.
export function parseSrpSearchParams(searchParams: RawParams): SearchJobsParams {
  const out: SearchJobsParams = {};

  const q = asString(searchParams['q']);
  if (q) out.q = q;

  const skills = asArray(searchParams['skill']);
  if (skills?.length) out.skillSlugs = skills;

  const cities = asArray(searchParams['city']);
  if (cities?.length) out.citySlugs = cities;

  const industry = asString(searchParams['industry']);
  if (industry) out.industrySlug = industry;

  // employmentType + workMode are accepted at the URL layer but the schema
  // doesn't have these columns yet (deferred per PR #7 plan). The values
  // round-trip through the URL but no-op at the index layer.
  // emp and mode are intentionally NOT mapped onto SearchJobsParams here.

  const expMin = asString(searchParams['expMin']);
  if (expMin !== undefined) {
    const n = Number(expMin);
    if (Number.isFinite(n) && n >= 0) out.minExperienceMonths = n * 12;
  }

  const expMax = asString(searchParams['expMax']);
  if (expMax !== undefined) {
    const n = Number(expMax);
    if (Number.isFinite(n) && n >= 0) out.maxExperienceMonths = n * 12;
  }

  const salaryMin = asString(searchParams['salaryMin']);
  if (salaryMin !== undefined) {
    const n = Number(salaryMin);
    if (Number.isFinite(n) && n >= 0) out.salaryMin = n;
  }

  const postedWithin = asString(searchParams['postedWithin']);
  if (postedWithin === '1' || postedWithin === '7' || postedWithin === '30') {
    out.postedWithinDays = Number(postedWithin) as 1 | 7 | 30;
  }

  const sort = asString(searchParams['sort']);
  if (sort === 'recent' || sort === 'salary_desc' || sort === 'relevance') {
    out.sort = sort;
  }

  const page = asString(searchParams['page']);
  if (page !== undefined) {
    const n = Number(page);
    if (Number.isFinite(n) && n > 0) out.page = Math.floor(n);
  }

  return out;
}

// Builds a canonical SRP href from a base path + a partial filter patch.
// Used by the filter UI to produce the next URL when a checkbox toggles.
// Query keys are sorted alphabetically per SRS §6.3 rule 4.
//
// `| undefined` is explicit on every field so callers can pass parsed
// search-param values directly (e.g. `q: searchParams.q` where the
// type is `string | undefined`). Without `| undefined` here,
// exactOptionalPropertyTypes rejects the call.
export type SrpHrefInput = {
  q?: string | undefined;
  skillSlugs?: string[] | undefined;
  citySlugs?: string[] | undefined;
  industrySlug?: string | undefined;
  emp?: string[] | undefined;
  mode?: string[] | undefined;
  minExperienceMonths?: number | undefined;
  maxExperienceMonths?: number | undefined;
  salaryMin?: number | undefined;
  postedWithinDays?: number | undefined;
  sort?: 'relevance' | 'recent' | 'salary_desc' | undefined;
  page?: number | undefined;
};

export function buildSrpHref(basePath: string, input: SrpHrefInput): string {
  const sp = new URLSearchParams();

  if (input.q) sp.append('q', input.q);
  for (const s of input.skillSlugs ?? []) sp.append('skill', s);
  for (const c of input.citySlugs ?? []) sp.append('city', c);
  if (input.industrySlug) sp.append('industry', input.industrySlug);
  for (const e of input.emp ?? []) sp.append('emp', e);
  for (const m of input.mode ?? []) sp.append('mode', m);
  if (input.minExperienceMonths !== undefined) {
    sp.append('expMin', String(Math.round(input.minExperienceMonths / 12)));
  }
  if (input.maxExperienceMonths !== undefined) {
    sp.append('expMax', String(Math.round(input.maxExperienceMonths / 12)));
  }
  if (input.salaryMin !== undefined) sp.append('salaryMin', String(input.salaryMin));
  if (input.postedWithinDays) sp.append('postedWithin', String(input.postedWithinDays));
  if (input.sort && input.sort !== 'relevance') sp.append('sort', input.sort);
  if (input.page && input.page > 1) sp.append('page', String(input.page));

  // Sort alphabetically — middleware would also do this, but doing it client-side
  // means we never produce a non-canonical URL in the first place.
  const sorted = Array.from(sp.entries()).sort(([a], [b]) => a.localeCompare(b));
  const out = new URLSearchParams();
  for (const [k, v] of sorted) out.append(k, v);

  const qs = out.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

// Helpers for FilterSidebar to read current selections from useSearchParams().
// Not exported — used by the filter components which receive a typed snapshot.
export function readSelections(searchParams: URLSearchParams): {
  skill: string[];
  city: string[];
  industry: string | null;
  emp: string[];
  mode: string[];
  expMin: number | null;
  expMax: number | null;
  salaryMin: number | null;
  postedWithin: 1 | 7 | 30 | null;
  sort: 'relevance' | 'recent' | 'salary_desc';
  page: number;
} {
  const postedRaw = searchParams.get('postedWithin');
  const postedWithin: 1 | 7 | 30 | null =
    postedRaw === '1' || postedRaw === '7' || postedRaw === '30' ? (Number(postedRaw) as 1 | 7 | 30) : null;
  const sortRaw = searchParams.get('sort');
  const sort: 'relevance' | 'recent' | 'salary_desc' =
    sortRaw === 'recent' || sortRaw === 'salary_desc' ? sortRaw : 'relevance';
  const expMin = searchParams.get('expMin');
  const expMax = searchParams.get('expMax');
  const salaryMin = searchParams.get('salaryMin');
  const page = searchParams.get('page');

  return {
    skill: searchParams.getAll('skill'),
    city: searchParams.getAll('city'),
    industry: searchParams.get('industry'),
    emp: searchParams.getAll('emp'),
    mode: searchParams.getAll('mode'),
    expMin: expMin !== null && Number.isFinite(Number(expMin)) ? Number(expMin) : null,
    expMax: expMax !== null && Number.isFinite(Number(expMax)) ? Number(expMax) : null,
    salaryMin: salaryMin !== null && Number.isFinite(Number(salaryMin)) ? Number(salaryMin) : null,
    postedWithin,
    sort,
    page: page && Number.isFinite(Number(page)) && Number(page) > 0 ? Math.floor(Number(page)) : 1,
  };
}
