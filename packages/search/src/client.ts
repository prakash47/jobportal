import { Client } from '@elastic/elasticsearch';

// HMR-safe singleton — Next.js / Nest hot reload otherwise creates a new client
// per reload. Cast through `unknown` because globalThis has no typed slot.
const globalForEs = globalThis as unknown as { __esClient?: Client };

function buildClient(): Client {
  // Build the options object conditionally so `auth: undefined` doesn't
  // land in the result — under exactOptionalPropertyTypes: true, the
  // ClientOptions auth field is BasicAuth | ApiKeyAuth | BearerAuth (no
  // explicit-undefined allowed). Local dev with no creds passes the
  // anonymous path by simply omitting the key.
  const opts: ConstructorParameters<typeof Client>[0] = {
    node: process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200',
    requestTimeout: 10_000,
  };
  if (
    process.env.ELASTICSEARCH_USERNAME &&
    process.env.ELASTICSEARCH_PASSWORD
  ) {
    opts.auth = {
      username: process.env.ELASTICSEARCH_USERNAME,
      password: process.env.ELASTICSEARCH_PASSWORD,
    };
  }
  return new Client(opts);
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
