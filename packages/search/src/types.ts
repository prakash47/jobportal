// Doc shapes — what's stored in the Elasticsearch index.
// These are denormalized snapshots of the Postgres rows; whenever the source
// row changes, the indexer rewrites the doc.

export type JobDoc = {
  id: number;
  canonicalSlug: string;
  title: string;
  description: string;
  shortDescription: string | null;
  companyId: number;
  companyName: string;
  companySlug: string;
  skills: string[];           // searchable text — skill display names
  skillSlugs: string[];       // filterable
  skillIds: number[];
  citySlugs: string[];
  cityIds: number[];
  primaryCitySlug: string | null;
  industrySlug: string | null;
  industryId: number | null;
  functionalAreaSlug: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'EXPIRED' | 'CLOSED';
  minExperienceMonths: number | null;
  maxExperienceMonths: number | null;
  salaryMin: number | null;   // paise
  salaryMax: number | null;   // paise
  postedAt: string;           // ISO 8601
  expiresAt: string | null;
  title_suggest: { input: string[] };
};

export type CompanyDoc = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  industrySlug: string | null;
  industryId: number | null;
  headquartersCitySlug: string | null;
  headquartersCityId: number | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  name_suggest: { input: string[] };
};

export type ArticleDoc = {
  id: number;
  slug: string;
  title: string;
  body: string;
  excerpt: string | null;
  authorName: string;
  status: string;
  publishedAt: string | null;
  title_suggest: { input: string[] };
};

// SRP query contract per SRS §4.1.2.
export type JobSortMode = 'relevance' | 'recent' | 'salary_desc';

export type SearchJobsParams = {
  q?: string;
  skillSlugs?: string[];
  citySlugs?: string[];
  cityIds?: number[];
  industrySlug?: string;
  functionalAreaSlug?: string;
  status?: 'DRAFT' | 'ACTIVE' | 'EXPIRED' | 'CLOSED';
  minExperienceMonths?: number;
  maxExperienceMonths?: number;
  salaryMin?: number;
  postedWithinDays?: 1 | 7 | 30;
  sort?: JobSortMode;
  page?: number;     // 1-indexed
  pageSize?: number; // default 20 (FR-4.1.4)
};

export type SearchJobsResult = {
  hits: JobDoc[];
  total: number;
  took: number;
  page: number;
  pageSize: number;
};

export type SuggestResult = {
  suggestions: string[];
};
