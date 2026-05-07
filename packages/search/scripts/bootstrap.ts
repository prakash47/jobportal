import { config } from 'dotenv';
import { resolve } from 'node:path';
config({ path: resolve(__dirname, '../../../.env') });

import { bootstrapIndexes } from '../src/indexes';

async function main(): Promise<void> {
  console.log('[bootstrap] creating Elasticsearch indexes if missing...');
  await bootstrapIndexes();
  console.log('[bootstrap] done.');
}

main().catch((err: unknown) => {
  console.error('[bootstrap] failed:', err);
  process.exit(1);
});
