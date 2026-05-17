// Entry point for the demo-applications overlay (chip #11). Run AFTER
// the main demo seed has loaded companies/recruiters/jobs.
//
// Same safety pattern as seed-demo.ts: refuses to run when
// NODE_ENV === 'production' AND requires DATABASE_URL to look local
// (override with ALLOW_DEMO_SEED_ON_REMOTE=true).

import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env') });

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client';
import { seedDemoApplications } from './seed/demo-applications';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run demo seed: NODE_ENV is "production".');
  }
  const dbUrl = process.env.DATABASE_URL ?? '';
  const looksLocal = /(?:localhost|127\.0\.0\.1|::1|\.local(?::|\/|$)|\.internal(?::|\/|$))/i.test(
    dbUrl,
  );
  if (!looksLocal && process.env.ALLOW_DEMO_SEED_ON_REMOTE !== 'true') {
    throw new Error(
      `Refusing to run demo seed: DATABASE_URL doesn't look local ("${dbUrl.replace(/:[^@]*@/, ':***@')}"). ` +
        'Set ALLOW_DEMO_SEED_ON_REMOTE=true to override.',
    );
  }
  console.log('[seed:demo:apps] starting...');
  await seedDemoApplications(prisma);
}

main()
  .catch((err: unknown) => {
    console.error('[seed:demo:apps] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
