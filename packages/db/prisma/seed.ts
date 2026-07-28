import { config } from 'dotenv';
import { resolve } from 'node:path';

// Load .env from monorepo root before instantiating Prisma.
config({ path: resolve(__dirname, '../../../.env') });

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client';
import { seedSuperAdmin } from './seed/admin';
import { seedArticles } from './seed/articles';
import { seedCities } from './seed/cities';
import { seedFlags } from './seed/flags';
import { seedFunctionalAreas } from './seed/functional-areas';
import { seedIndustries } from './seed/industries';
import { seedLocalities } from './seed/localities';
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

  console.log('[seed] localities (city → area)...');
  await seedLocalities(prisma);

  console.log('[seed] functional areas (departments)...');
  await seedFunctionalAreas(prisma);

  console.log('[seed] skills...');
  await seedSkills(prisma);

  console.log('[seed] career-advice articles...');
  await seedArticles(prisma);

  // Super admin for the internal /sadmin portal. Last because it is the only
  // step that creates a User row — keeping it after the reference data makes
  // the log read in dependency order even though it has no dependencies.
  console.log('[seed] super admin (sadmin portal)...');
  await seedSuperAdmin(prisma);

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
