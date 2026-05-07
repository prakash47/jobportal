import { es, INDEX_ALIAS } from '../client';
import type { JobDoc, SearchJobsParams, SearchJobsResult } from '../types';

// Per SRS §4.1.2 + §4.1.3 + §4.14.
//
// Filters compose into bool.filter (no scoring contribution). Free-text query
// becomes a multi_match with field boosts: title is the strongest signal,
// company name and skills next, then descriptions. Sort dispatches between
// relevance (default _score), recency (postedAt desc), and salary (salaryMax desc).

export async function searchJobs(params: SearchJobsParams = {}): Promise<SearchJobsResult> {
  const {
    q,
    skillSlugs,
    citySlugs,
    cityIds,
    industrySlug,
    functionalAreaSlug,
    status,
    minExperienceMonths,
    maxExperienceMonths,
    salaryMin,
    postedWithinDays,
    sort = 'relevance',
    page = 1,
    pageSize = 20,
  } = params;

  const filter: Record<string, unknown>[] = [];

  // Default to ACTIVE so the SRP never accidentally surfaces drafts/closed.
  filter.push({ term: { status: status ?? 'ACTIVE' } });

  if (skillSlugs?.length) filter.push({ terms: { skillSlugs } });
  if (citySlugs?.length) filter.push({ terms: { citySlugs } });
  if (cityIds?.length) filter.push({ terms: { cityIds } });
  if (industrySlug) filter.push({ term: { industrySlug } });
  if (functionalAreaSlug) filter.push({ term: { functionalAreaSlug } });

  if (minExperienceMonths !== undefined) {
    filter.push({ range: { minExperienceMonths: { gte: minExperienceMonths } } });
  }
  if (maxExperienceMonths !== undefined) {
    filter.push({ range: { maxExperienceMonths: { lte: maxExperienceMonths } } });
  }
  if (salaryMin !== undefined) {
    filter.push({ range: { salaryMax: { gte: salaryMin } } });
  }
  if (postedWithinDays) {
    filter.push({ range: { postedAt: { gte: `now-${postedWithinDays}d/d` } } });
  }

  const query = q
    ? {
        bool: {
          filter,
          must: [
            {
              multi_match: {
                query: q,
                fields: ['title^4', 'companyName^2', 'skills^2', 'shortDescription', 'description'],
                type: 'best_fields',
                fuzziness: 'AUTO',
              },
            },
          ],
        },
      }
    : { bool: { filter } };

  let sortClause: Array<Record<string, unknown> | string>;
  switch (sort) {
    case 'recent':
      sortClause = [{ postedAt: { order: 'desc' } }];
      break;
    case 'salary_desc':
      sortClause = [{ salaryMax: { order: 'desc' } }, '_score'];
      break;
    case 'relevance':
    default:
      sortClause = q ? ['_score', { postedAt: { order: 'desc' } }] : [{ postedAt: { order: 'desc' } }];
      break;
  }

  const result = await es.search<JobDoc>({
    index: INDEX_ALIAS.jobs,
    from: Math.max(0, (page - 1) * pageSize),
    size: pageSize,
    query,
    sort: sortClause,
    track_total_hits: true,
  });

  const totalRaw = result.hits.total;
  const total = typeof totalRaw === 'number' ? totalRaw : totalRaw?.value ?? 0;

  return {
    hits: result.hits.hits.map((h) => h._source).filter((s): s is JobDoc => s !== undefined),
    total,
    took: result.took,
    page,
    pageSize,
  };
}
