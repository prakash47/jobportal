// Prisma 7 config — replaces the old datasource env() pattern.
// .env files are NOT auto-loaded by Prisma 7; we load from monorepo root.

import { config } from 'dotenv';
import { resolve } from 'node:path';

// Load .env from monorepo root before Prisma reads env vars
config({ path: resolve(__dirname, '../../.env') });

import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
