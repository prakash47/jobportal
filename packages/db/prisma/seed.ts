import { config } from 'dotenv';
import { resolve } from 'node:path';

// Load .env from monorepo root before instantiating Prisma.
config({ path: resolve(__dirname, '../../../.env') });

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client';
import { seedArticles } from './seed/articles';
import { seedCities } from './seed/cities';
import { seedFlags } from './seed/flags';
import { seedIndustries } from './seed/industries';
import { seedPlans } from './seed/plans';
import { seedSkills } from './seed/skills';

// Prisma 7's Rust-free client requires a driver adapter. The schema's datasource
// block has provider only; the connection string lives in the env-loaded URL.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  console.log('[seed] feature flags...');
  await seedFlags(prisma);

  console.log('[seed] subscription plans...');
  await seedPlans(prisma);

  console.log('[seed] industries...');
  await seedIndustries(prisma);

  console.log('[seed] cities...');
  await seedCities(prisma);

  console.log('[seed] skills...');
  await seedSkills(prisma);

  console.log('[seed] career-advice articles...');
  await seedArticles(prisma);

  console.log('[seed] complete.');
}

main()
  .catch((err: unknown) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
