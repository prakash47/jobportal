// @jobportal/search — Elasticsearch 9 client, indexers, and search query helpers.
// Replaces SRS §4.14's Meilisearch references per CLAUDE.md §1.

export { es, INDEX_ALIAS, type IndexAlias } from './client';
export type {
  ArticleDoc,
  CompanyDoc,
  EmploymentType,
  JobDoc,
  JobSortMode,
  SearchJobsParams,
  SearchJobsResult,
  SuggestResult,
  WorkMode,
} from './types';

export {
  ARTICLES_INDEX_MAPPING,
  ARTICLES_INDEX_SETTINGS,
  COMPANIES_INDEX_MAPPING,
  COMPANIES_INDEX_SETTINGS,
  JOBS_INDEX_MAPPING,
  JOBS_INDEX_SETTINGS,
  bootstrapIndexes,
  nextVersionedIndex,
  resolveCurrentIndexFor,
} from './indexes';

export {
  bulkIndexArticles,
  bulkIndexCompanies,
  bulkIndexJobs,
  indexArticle,
  indexCompany,
  indexJob,
  removeArticle,
  removeCompany,
  removeJob,
} from './indexers';

export {
  searchJobs,
  suggestCompanyNames,
  suggestJobTitles,
} from './queries';

export { syncArticle, syncCompany, syncJob, type SyncEntity, type SyncOp } from './sync';

export type { ArticleInput } from './transforms/article.transform';
export type { CompanyInput, CompanyLookups } from './transforms/company.transform';
export type { JobInput, JobLookups } from './transforms/job.transform';
