import { config } from 'dotenv';
import { resolve } from 'node:path';

// The integration block below needs DATABASE_URL. Vitest runs with cwd set to
// the package root under both `pnpm --filter` and turbo, so the monorepo root
// .env is two levels up. If it isn't found, DATABASE_URL stays unset and that
// block skips rather than fails.
config({ path: resolve(process.cwd(), '../../.env') });

import { Client } from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceSequence, type RawQueryClient } from './sequence';

// ============================================================
// Unit — no database
// ============================================================

/** Records every statement and replays canned rows, in call order. */
function fakeClient(responses: unknown[][]): RawQueryClient & { calls: Array<[string, unknown[]]> } {
  const calls: Array<[string, unknown[]]> = [];
  return {
    calls,
    $queryRawUnsafe: vi.fn(async (query: string, ...values: unknown[]) => {
      calls.push([query, values]);
      return (responses[calls.length - 1] ?? []) as never;
    }),
  };
}

describe('advanceSequence — guards', () => {
  it.each([
    ['User"; DROP TABLE "User', 'quote break-out'],
    ['public.User', 'qualified name'],
    ['', 'empty'],
    ['1User', 'leading digit'],
  ])('rejects the table name %j (%s) without issuing a query', async (table) => {
    const client = fakeClient([]);
    await expect(advanceSequence(client, table)).rejects.toThrow(/unsafe table name/);
    expect(client.calls).toHaveLength(0);
  });

  it('rejects an unsafe column name without issuing a query', async () => {
    const client = fakeClient([]);
    await expect(advanceSequence(client, 'User', 'id) --')).rejects.toThrow(/unsafe column name/);
    expect(client.calls).toHaveLength(0);
  });

  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2])(
    'rejects the floor %s',
    async (atLeast) => {
      const client = fakeClient([]);
      await expect(advanceSequence(client, 'User', 'id', atLeast)).rejects.toThrow(/atLeast/);
      expect(client.calls).toHaveLength(0);
    },
  );

  it('explains itself when the column owns no sequence', async () => {
    const client = fakeClient([[{ sequence: null, before: 0 }]]);
    await expect(advanceSequence(client, 'Article', 'slug')).rejects.toThrow(/owns no sequence/);
    // Probed, but never attempted the setval.
    expect(client.calls).toHaveLength(1);
  });

  it('refuses a value that would lose precision rather than returning a wrong number', async () => {
    const client = fakeClient([
      [{ sequence: 'public."User_id_seq"', before: '9007199254740993' }],
    ]);
    await expect(advanceSequence(client, 'User')).rejects.toThrow(/not a safe integer/);
  });
});

describe('advanceSequence — statement shape', () => {
  it('takes the greatest of max(id), the current sequence value, and the floor', async () => {
    const client = fakeClient([
      [{ sequence: 'public."User_id_seq"', before: 200022n }],
      [{ after: 200022n }],
    ]);

    const result = await advanceSequence(client, 'User', 'id', 200020);

    const [probeSql, probeParams] = client.calls[0]!;
    expect(probeSql).toContain('pg_get_serial_sequence($1, $2)');
    expect(probeParams).toEqual(['"User"', 'id']);

    const [setvalSql, setvalParams] = client.calls[1]!;
    // The three operands together are what makes this monotonic. A regression
    // to `setval(seq, <constant>)` would drop two of them.
    expect(setvalSql).toContain('GREATEST');
    expect(setvalSql).toContain('SELECT COALESCE(MAX("id"), 0) FROM "User"');
    expect(setvalSql).toContain('COALESCE(pg_sequence_last_value($1::regclass), 0)');
    expect(setvalSql).toContain('$2::bigint');
    expect(setvalParams).toEqual(['public."User_id_seq"', 200020]);

    expect(result).toEqual({
      sequence: 'public."User_id_seq"',
      before: 200022,
      after: 200022,
      moved: false,
    });
  });

  it('reports movement, and normalises bigint and string driver shapes alike', async () => {
    const client = fakeClient([
      [{ sequence: 'public."Job_id_seq"', before: '1' }],
      [{ after: 100050n }],
    ]);

    await expect(advanceSequence(client, 'Job', 'id', 100050)).resolves.toEqual({
      sequence: 'public."Job_id_seq"',
      before: 1,
      after: 100050,
      moved: true,
    });
  });
});

// ============================================================
// Integration — real Postgres, on a throwaway table
// ============================================================
//
// This is the regression the helper exists for, and it only means anything
// against a real server: seed with explicit ids, let real rows accumulate,
// re-seed, and check that the next insert still succeeds.
//
// It runs on a local database only, and never touches an application table —
// it creates and drops its own. Uses `pg` directly rather than PrismaClient so
// the suite does not require `prisma generate` to have been run.
//
// Two gates, and they are not the same question. The URL predicate (borrowed
// from the seed entry points) asks "is this database SAFE to write to"; the
// connection probe asks "is anything actually LISTENING". Only checking the
// first is how a suite ends up red on a laptop with Docker stopped, so the
// probe runs before the block is declared and the whole block skips — with a
// reason on stderr — rather than failing in beforeAll.

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const LOOKS_LOCAL =
  /(?:localhost|127\.0\.0\.1|::1|\.local(?::|\/|$)|\.internal(?::|\/|$))/i.test(DATABASE_URL);
const SAFE_TARGET =
  DATABASE_URL !== '' && LOOKS_LOCAL && process.env.NODE_ENV !== 'production';

// Unique per worker process: vitest forks, and two runs against one database
// (two worktrees, or a watcher beside `pnpm test`) would otherwise drop each
// other's fixture mid-test.
const TABLE = `_seq_advance_probe_${process.pid}`;

/**
 * A connection refusal arrives as an `AggregateError` whose own message is
 * empty (one sub-error per resolved address), so reporting `err.message`
 * verbatim would print an empty parenthetical in the one place a developer
 * needs the reason.
 */
function describeError(err: unknown): string {
  if (err instanceof AggregateError) {
    const inner = err.errors.map(describeError).filter(Boolean);
    if (inner.length > 0) return [...new Set(inner)].join('; ');
  }
  if (err instanceof Error && err.message !== '') return err.message;
  if (err instanceof Error) return err.name;
  return String(err);
}

async function connectOrExplain(): Promise<Client | null> {
  if (!SAFE_TARGET) return null;
  const candidate = new Client({ connectionString: DATABASE_URL, connectionTimeoutMillis: 5_000 });
  try {
    await candidate.connect();
    return candidate;
  } catch (err) {
    await candidate.end().catch(() => undefined);
    console.warn(
      `[sequence.test] Postgres integration tests SKIPPED — ${DATABASE_URL.replace(/:[^@]*@/, ':***@')} ` +
        `is not reachable (${describeError(err)}). Run \`pnpm infra:up\` to include them.`,
    );
    return null;
  }
}

const pg = await connectOrExplain();

describe.skipIf(pg === null)('advanceSequence — against Postgres', () => {
  const db = pg!;
  // Thin shim: `pg.query` already speaks the $1 placeholder dialect that
  // `$queryRawUnsafe` uses, so the helper cannot tell the difference.
  const client: RawQueryClient = {
    $queryRawUnsafe: async <T>(query: string, ...values: unknown[]) =>
      (await db.query(query, values)).rows as T,
  };

  afterAll(async () => {
    await db.query(`DROP TABLE IF EXISTS ${TABLE}`);
    await db.end();
  });

  beforeEach(async () => {
    await db.query(`DROP TABLE IF EXISTS ${TABLE}`);
    await db.query(`CREATE TABLE ${TABLE} (id serial PRIMARY KEY, note text)`);
  });

  afterEach(async () => {
    await db.query(`DROP TABLE IF EXISTS ${TABLE}`);
  });

  /** A row inserted the way the app does it — no explicit id. */
  async function signup(note: string): Promise<number> {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO ${TABLE} (note) VALUES ($1) RETURNING id`,
      [note],
    );
    return rows[0]!.id;
  }

  /** Rows written the way a demo seed writes them — explicit ids. */
  async function seedExplicitRows(from: number, to: number): Promise<void> {
    await db.query(
      `INSERT INTO ${TABLE} (id, note) SELECT g, 'demo' FROM generate_series($1::bigint, $2::bigint) g`,
      [from, to],
    );
  }

  it('re-seeding after real signups does not break the next signup', async () => {
    // First seed: 20 candidates at 200001-200020, then advance.
    await seedExplicitRows(200001, 200020);
    await advanceSequence(client, TABLE, 'id', 200020);

    // Real users register through the app.
    expect(await signup('recruiter-a')).toBe(200021);
    expect(await signup('recruiter-b')).toBe(200022);

    // Re-run the seed. The old unconditional `setval(seq, 200020, true)` put
    // the sequence back below both rows above; this must not.
    const result = await advanceSequence(client, TABLE, 'id', 200020);
    expect(result.after).toBe(200022);
    expect(result.after).toBeGreaterThanOrEqual(result.before);

    // The regression: this insert used to fail with duplicate key on id 200021.
    await expect(signup('recruiter-c')).resolves.toBe(200023);
  });

  // Characterises the shape that was removed, so the test above is anchored to
  // a demonstrated failure rather than to an assumption about Postgres. (The
  // test that bites on a revert is the one above: restore the unconditional
  // setval inside advanceSequence and it fails on the last line.)
  it('the unconditional setval this replaced does rewind under live rows', async () => {
    await seedExplicitRows(200001, 200020);
    await advanceSequence(client, TABLE, 'id', 200020);
    await signup('recruiter-a');

    // Exactly what the seeds used to do.
    await db.query(`SELECT setval(pg_get_serial_sequence('${TABLE}', 'id'), $1, true)`, [200020]);

    await expect(signup('recruiter-b')).rejects.toThrow(/duplicate key value/);
  });

  it('is idempotent — repeated calls do not move the sequence', async () => {
    await seedExplicitRows(200001, 200020);

    const first = await advanceSequence(client, TABLE, 'id', 200020);
    expect(first.after).toBe(200020);
    expect(first.moved).toBe(true);

    const second = await advanceSequence(client, TABLE, 'id', 200020);
    expect(second.before).toBe(200020);
    expect(second.after).toBe(200020);
    expect(second.moved).toBe(false);

    expect(await signup('after-two-runs')).toBe(200021);
  });

  it('respects rows above the floor even when the seed never ran', async () => {
    // Sequence untouched at "never called"; a row exists well above the floor.
    await db.query(`INSERT INTO ${TABLE} (id, note) VALUES (500, 'imported')`);

    const result = await advanceSequence(client, TABLE, 'id', 100);
    expect(result.before).toBe(0);
    expect(result.after).toBe(500);
    expect(await signup('next')).toBe(501);
  });

  it('leaves id 1 available on an empty table with a fresh sequence', async () => {
    const result = await advanceSequence(client, TABLE, 'id', 0);
    // Nothing is spoken for, so nothing moved — and 1 is handed out rather
    // than skipped, because the sequence is left is_called=false.
    expect(result).toMatchObject({ before: 0, after: 0, moved: false });
    expect(await signup('first-ever')).toBe(1);

    // Still honest on a second pass now that a row exists.
    const second = await advanceSequence(client, TABLE, 'id', 0);
    expect(second).toMatchObject({ before: 1, after: 1, moved: false });
  });

  it('raises the sequence to the floor when the table is empty but ids are reserved', async () => {
    const result = await advanceSequence(client, TABLE, 'id', 200020);
    expect(result.after).toBe(200020);
    expect(await signup('first-real')).toBe(200021);
  });

  it('rejects a column that owns no sequence', async () => {
    await expect(advanceSequence(client, TABLE, 'note')).rejects.toThrow(/owns no sequence/);
  });
});
