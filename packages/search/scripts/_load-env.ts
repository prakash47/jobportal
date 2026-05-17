// Side-effect entry that populates process.env from monorepo-root .env
// BEFORE any other module (notably @jobportal/db) is evaluated.
//
// Why this exists: the indexers chain (../src/indexers/*.ts) imports
// `prisma` from `@jobportal/db`, which builds its Prisma client at
// module-evaluation time using process.env.DATABASE_URL. ES-module
// import semantics hoist all `import` statements above any other
// top-level code, so a `config()` call placed AFTER the import in
// reindex.ts runs too late. By making env-loading itself an `import`,
// it slots into the import graph BEFORE the indexer chain pulls
// @jobportal/db in.
//
// Same root cause and same fix-shape as the apps/api/instrument.ts
// dotenv/config trick from PR #33.

import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env') });
