import { config } from 'dotenv';
import { resolve } from 'node:path';

// Needs DATABASE_URL. Vitest runs with cwd set to the package root under both
// `pnpm --filter` and turbo, so the monorepo root .env is two levels up. If it
// isn't found, DATABASE_URL stays unset and this file skips rather than fails —
// the same arrangement sequence.test.ts uses.
config({ path: resolve(process.cwd(), '../../.env') });

import { describe, expect, it } from 'vitest';

// ============================================================
// Regression — Prisma cannot deserialize a `void` column
// ============================================================
//
// WHY THIS FILE EXISTS, and why it needs a real server.
//
// Both billing services serialize their writes on a per-company Postgres
// advisory lock:
//
//     SELECT pg_advisory_xact_lock(hashtext('billing:company:<id>'))
//
// `pg_advisory_xact_lock()` returns **void**, and Prisma's `$queryRaw`
// deserializes the result set — so issuing this through `$queryRaw` throws
// *"Failed to deserialize column of type 'void'"* and takes the whole
// transaction with it. `$executeRaw` does not deserialize, and works.
//
// RecruiterBillingService.activatePaidOrder shipped with `$queryRaw` here and
// had never executed: PaymentOrder has zero rows, the Razorpay gateway is
// unprovisioned, and every service test mocks Prisma — so the FIRST REAL
// PAYMENT CAPTURE would have been its first execution, and it would have failed
// *after the customer was charged*. It surfaced only because the admin console
// copied the line verbatim and its first live grant 500'd.
//
// No mock-based test can catch this class of bug: a `vi.fn()` named $queryRaw
// resolves happily whatever the real driver would do. That is the entire
// argument for this file. It asserts BOTH directions — that the broken form is
// still broken, and that the form the services use works — because a test that
// only pinned the working call would pass just as well if Prisma later fixed
// void deserialization and the distinction stopped mattering.

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const LOOKS_LOCAL =
  /(?:localhost|127\.0\.0\.1|::1|\.local(?::|\/|$)|\.internal(?::|\/|$))/i.test(DATABASE_URL);
const SAFE_TARGET = DATABASE_URL !== '' && LOOKS_LOCAL && process.env.NODE_ENV !== 'production';

// Read-only: taking an advisory lock inside a transaction that then ends writes
// nothing and touches no application table. Still gated to a local database,
// matching sequence.test.ts — the URL predicate asks "is this safe to connect
// to", the import probe below asks "is the client even generated".
type PrismaLike = {
  $transaction: <T>(fn: (tx: PrismaLike) => Promise<T>) => Promise<T>;
  $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  $disconnect: () => Promise<void>;
};

// Loaded dynamically so a clone that has not run `pnpm db:generate` skips this
// block instead of failing to collect — sequence.test.ts avoids the generated
// client entirely for that reason, but this regression is specifically about
// PRISMA's deserializer, so `pg` would not reproduce it.
//
// ./client, not ../generated/client: Prisma 7 is Rust-free and its client
// REQUIRES a driver adapter, so `new PrismaClient()` with no options throws
// before it can connect. ./client is the configured singleton every app in this
// repo uses, which also makes this test exercise the same construction the
// services do rather than a bespoke one.
async function loadPrisma(): Promise<PrismaLike | null> {
  if (!SAFE_TARGET) {
    process.stderr.write(`[advisory-lock.test] SKIPPED — DATABASE_URL is unset or not local.\n`);
    return null;
  }
  try {
    const mod = (await import('./client')) as unknown as { prisma: PrismaLike };
    // Probe: a connection refusal must skip the block, not redden the suite on a
    // laptop with Docker stopped.
    await mod.prisma.$queryRaw`SELECT 1`;
    return mod.prisma;
  } catch (err) {
    process.stderr.write(
      `[advisory-lock.test] SKIPPED — ${(err as Error).message.split('\n')[0]}\n`,
    );
    return null;
  }
}

const prisma = await loadPrisma();

describe.skipIf(prisma === null)('pg_advisory_xact_lock through Prisma', () => {
  const key = 'billing:company:test';

  it('FAILS through $queryRaw — the void column Prisma cannot deserialize', async () => {
    const client = prisma as PrismaLike;
    await expect(
      client.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
      }),
    ).rejects.toThrow(/deserialize|void/i);
  });

  it('SUCCEEDS through $executeRaw — the form both billing services use', async () => {
    const client = prisma as PrismaLike;
    await expect(
      client.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
      }),
    ).resolves.not.toThrow();
  });

  it('releases the lock at transaction end, so a second acquire does not block', async () => {
    const client = prisma as PrismaLike;
    // xact locks are held to the end of the transaction and released
    // automatically. If they leaked, the purchase path and the admin console
    // would deadlock against each other after the first grant rather than
    // serializing — so this asserts the release, not just the acquire.
    for (let i = 0; i < 2; i += 1) {
      await client.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
      });
    }
    expect(true).toBe(true);
  });
});
