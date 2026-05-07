import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client';

// HMR-safe singleton — Next.js / Nest hot reload otherwise creates a new client
// per reload and exhausts the connection pool. Cast through `unknown` because
// `globalThis` has no typed slot for our cached client.
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

// Prisma 7's Rust-free client requires a driver adapter — the runtime no longer
// embeds a Postgres connector. Apps must load .env before this module runs so
// DATABASE_URL is populated.
function buildClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: process.env.PRISMA_LOG_QUERIES === 'true' ? ['query', 'error', 'warn'] : ['error', 'warn'],
  });
}

export const prisma = globalForPrisma.__prisma ?? buildClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}
