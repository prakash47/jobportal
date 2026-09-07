// Entry point for the demo job-alerts overlay. Run AFTER the demo-applications
// seed, which creates the candidates these alerts are derived from.
//
// Same safety pattern as seed-demo-applications.ts: refuses to run when
// NODE_ENV === 'production' AND requires DATABASE_URL to look local
// (override with ALLOW_DEMO_SEED_ON_REMOTE=true).

import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env') });

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client';
import { seedDemoAlerts } from './seed/demo-alerts';

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
  console.log('[seed:demo:alerts] starting...');
  await seedDemoAlerts(prisma);
}

main()
  .catch((err: unknown) => {
    console.error('[seed:demo:alerts] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
