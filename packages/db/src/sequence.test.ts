import { config } from 'dotenv';
import { resolve } from 'node:path';

// The integration block below needs DATABASE_URL. Vitest runs with cwd set to
// the package root under both `pnpm --filter` and turbo, so the monorepo root
// .env is two levels up. If it isn't found, DATABASE_URL stays unset and that
// block skips rather than fails.
config({ path: resolve(process.cwd(), '../../.env') });

import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
// It runs on a local database only (same guard the demo seed entry points use)
// and never touches an application table — it creates and drops its own. Uses
// `pg` directly rather than PrismaClient so the suite does not require
// `prisma generate` to have been run.

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const LOOKS_LOCAL =
  /(?:localhost|127\.0\.0\.1|::1|\.local(?::|\/|$)|\.internal(?::|\/|$))/i.test(DATABASE_URL);
const RUN_DB_TESTS = DATABASE_URL !== '' && LOOKS_LOCAL;

const TABLE = '_seq_advance_probe';

describe.skipIf(!RUN_DB_TESTS)('advanceSequence — against Postgres', () => {
  let pg: Client;
  let client: RawQueryClient;

  beforeAll(async () => {
    pg = new Client({ connectionString: DATABASE_URL });
    await pg.connect();
    // Thin shim: `pg.query` already speaks the $1 placeholder dialect that
    // `$queryRawUnsafe` uses, so the helper cannot tell the difference.
    client = {
      $queryRawUnsafe: async <T>(query: string, ...values: unknown[]) =>
        (await pg.query(query, values)).rows as T,
    };
  });

  afterAll(async () => {
    if (pg) {
      await pg.query(`DROP TABLE IF EXISTS ${TABLE}`);
      await pg.end();
    }
  });

  beforeEach(async () => {
    await pg.query(`DROP TABLE IF EXISTS ${TABLE}`);
    await pg.query(`CREATE TABLE ${TABLE} (id serial PRIMARY KEY, note text)`);
  });

  afterEach(async () => {
    await pg.query(`DROP TABLE IF EXISTS ${TABLE}`);
  });

  /** A row inserted the way the app does it — no explicit id. */
  async function signup(note: string): Promise<number> {
    const { rows } = await pg.query<{ id: number }>(
      `INSERT INTO ${TABLE} (note) VALUES ($1) RETURNING id`,
      [note],
    );
    return rows[0]!.id;
  }

  /** Rows written the way a demo seed writes them — explicit ids. */
  async function seedExplicitRows(from: number, to: number): Promise<void> {
    await pg.query(
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

  it('the old unconditional setval really does break it (proves the test bites)', async () => {
    await seedExplicitRows(200001, 200020);
    await advanceSequence(client, TABLE, 'id', 200020);
    await signup('recruiter-a');

    // Exactly what the seeds used to do.
    await pg.query(`SELECT setval(pg_get_serial_sequence('${TABLE}', 'id'), $1, true)`, [200020]);

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
    await pg.query(`INSERT INTO ${TABLE} (id, note) VALUES (500, 'imported')`);

    const result = await advanceSequence(client, TABLE, 'id', 100);
    expect(result.before).toBe(0);
    expect(result.after).toBe(500);
    expect(await signup('next')).toBe(501);
  });

  it('leaves id 1 available on an empty table with a fresh sequence', async () => {
    const result = await advanceSequence(client, TABLE, 'id', 0);
    expect(result.before).toBe(0);
    expect(result.after).toBe(1);
    // is_called=false, so 1 is handed out rather than skipped.
    expect(await signup('first-ever')).toBe(1);
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
