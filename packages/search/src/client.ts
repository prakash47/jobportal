import { Client } from '@elastic/elasticsearch';

// HMR-safe singleton — Next.js / Nest hot reload otherwise creates a new client
// per reload. Cast through `unknown` because globalThis has no typed slot.
const globalForEs = globalThis as unknown as { __esClient?: Client };

function buildClient(): Client {
  return new Client({
    node: process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200',
    auth:
      process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD
        ? {
            username: process.env.ELASTICSEARCH_USERNAME,
            password: process.env.ELASTICSEARCH_PASSWORD,
          }
        : undefined,
    requestTimeout: 10_000,
  });
}

export const es = globalForEs.__esClient ?? buildClient();

if (process.env.NODE_ENV !== 'production') {
  globalForEs.__esClient = es;
}

export const INDEX_ALIAS = {
  jobs: 'jobs',
  companies: 'companies',
  articles: 'articles',
} as const;

export type IndexAlias = (typeof INDEX_ALIAS)[keyof typeof INDEX_ALIAS];
