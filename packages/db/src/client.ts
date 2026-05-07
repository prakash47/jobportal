import { PrismaClient } from '../generated/client';

// HMR-safe singleton — Next.js / Nest hot reload otherwise creates a new client
// per reload and exhausts the connection pool. Cast through `unknown` because
// `globalThis` has no typed slot for our cached client.
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

export const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG_QUERIES === 'true' ? ['query', 'error', 'warn'] : ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}
