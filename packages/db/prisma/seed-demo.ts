// Demo-seed entry point. Distinct from the main `seed.ts` so reference data
// (industries, cities, skills, articles, flags, plans) doesn't drag demo
// rows along with it — and so demo data never accidentally lands in prod.
//
// Usage (local dev only): `pnpm db:seed:demo`
//
// Prerequisite: `pnpm db:seed` must have already populated reference data
// (industries / cities / skills); this script fails with a clear error
// if those tables are empty.

import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env') });

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client';
import { seedDemo } from './seed/demo';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to run demo seed in production. Set NODE_ENV != production to override.',
    );
  }
  console.log('[seed:demo] starting...');
  await seedDemo(prisma);
}

main()
  .catch((err: unknown) => {
    console.error('[seed:demo] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
