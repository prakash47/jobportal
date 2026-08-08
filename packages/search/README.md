# @jobportal/search

Elasticsearch 9 client, index mappings, indexers, and search query helpers. Implements SRS §4.14 with the **CLAUDE.md §1 ES-over-Meilisearch override** — wherever the SRS says "Meilisearch", we use Elasticsearch.

## Public API

```ts
import {
  // Client + aliases
  es, INDEX_ALIAS,

  // Bootstrap + reindex helpers
  bootstrapIndexes, resolveCurrentIndexFor, nextVersionedIndex,

  // Indexers (per-entity)
  indexJob, removeJob, bulkIndexJobs,
  indexCompany, removeCompany, bulkIndexCompanies,
  indexArticle, removeArticle, bulkIndexArticles,

  // Sync (thin wrapper today; LISTEN/NOTIFY → BullMQ pipeline lands later)
  syncJob, syncCompany, syncArticle,

  // Queries
  searchJobs, suggestJobTitles, suggestCompanyNames,
} from '@jobportal/search';
```

## Indexes

| Alias | Purpose | Primary searchable fields | Filterable |
|---|---|---|---|
| `jobs` | SRP backing store | title, description, shortDescription, companyName, skills | skillSlugs, citySlugs, cityIds, industrySlug, functionalAreaSlug, status, employmentType, workMode, minExperienceMonths, maxExperienceMonths, salaryMin/Max |
| `companies` | Company directory + suggester | name, description | industrySlug, headquartersCitySlug |
| `articles` | Career-advice search | title, body, excerpt | status |

Each alias points at a versioned index (`jobs-v1`, `jobs-v2`, …). `pnpm search:reindex` builds `vN+1`, atomically swaps the alias, and drops the old version — **zero search downtime**.

## Scripts

```bash
pnpm search:bootstrap        # creates the 3 indexes if missing (idempotent)
pnpm search:reindex          # full bulk reindex with alias swap
pnpm search:seed-fixtures    # 100 synthetic companies + 10k synthetic jobs (NODE_ENV !== 'production')
pnpm search:benchmark        # 50 representative queries; reports p50/p95/p99
```

## Search query contract (SRS §4.1.2 + §4.1.3)

```ts
searchJobs({
  q: 'senior frontend',                 // free-text
  skillSlugs: ['react', 'typescript'],  // multi-select
  citySlugs: ['bangalore', 'pune'],     // multi-city per FR-4.1.2
  industrySlug: 'it-software',
  minExperienceMonths: 36,
  salaryMin: 1_200_000_00,              // paise
  postedWithinDays: 7,                  // 1 | 7 | 30
  sort: 'salary_desc',                  // 'relevance' | 'recent' | 'salary_desc'
  page: 1,
  pageSize: 20,                         // FR-4.1.4
});
// → { hits: JobDoc[], total, took, page, pageSize }
```

Free-text queries become a `multi_match` with field boosts: `title^4`, `companyName^2`, `skills^2`, then descriptions. Filters compose into `bool.filter` (no scoring contribution).

## Type-ahead (FR-4.14.7)

ES `completion` suggester on `title_suggest` (jobs/articles) and `name_suggest` (companies). Skills + cities are small reference data and are queried directly from Postgres via `ILIKE 'prefix%'` — round-trip is faster than a separate ES index.

## Sync (FR-4.14.6) — current state

The `syncJob` / `syncCompany` / `syncArticle` functions today are a thin pass-through that calls the indexer directly. The full Postgres LISTEN/NOTIFY → BullMQ → worker pipeline lands in a follow-up branch (likely `feature/recruiter-job-posting` or `feature/search-sync-pipeline`) — swapping in the queue is a non-breaking change because the function signatures stay the same.

## Architecture notes

For the full rationale (why ES over Meilisearch, alias strategy, alternatives considered), see [`docs/adr/0004-elasticsearch-over-meilisearch.md`](../../docs/adr/0004-elasticsearch-over-meilisearch.md) — local-only.
