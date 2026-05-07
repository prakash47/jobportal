// @jobportal/db — Prisma 7 client + query helpers (SRS §8).
// Schema lives in ./prisma/schema.prisma.

export { prisma } from './client';
export * from './queries';

// Re-export Prisma's generated types and enums so consumers import from
// @jobportal/db rather than reaching into the gitignored generated/ path.
export * from '../generated/client';
