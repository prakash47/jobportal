// Monotonic sequence advance for seeds that insert explicit primary keys.
//
// Postgres does not move a SERIAL / `@default(autoincrement())` sequence when a
// row is inserted with an explicit id, so a seed that writes `id: 100001` leaves
// `Job_id_seq` sitting at 1 and the next real `prisma.job.create()` collides.
// The demo seeds therefore end with a `setval()` to push the sequence past their
// own range.
//
// A plain `setval(seq, <highest demo id>, true)` is the wrong shape for that job.
// It is an unconditional *assignment*, and its target is derived from the seed's
// own constants — nothing about the database it is being applied to. Re-run the
// seed against a database that has since grown rows above that constant (a real
// signup, the seeded super-admin) and the sequence moves BACKWARDS below
// `max(id)`. `nextval()` then hands out ids that are already taken, and every
// insert fails with a duplicate-key error (Prisma P2002) until the sequence
// climbs back past the highest existing row.
//
// Observed 2026-07-29 on a dev machine: `User_id_seq` had been rewound to 200020
// while rows 200021-200023 existed (two real recruiter signups plus the seeded
// admin), and both recruiter and candidate registration returned 500.
// `Job_id_seq` was in the same state on the same database — `last_value` 100053
// against `max(id)` 100240 — and was latent only because that id range happened
// to be sparse.
//
// `advanceSequence()` is the safe form: it never lowers a sequence. The new
// high-water mark is the greatest of the table's current `max(id)`, wherever the
// sequence already is, and the caller's floor.

/**
 * The slice of `PrismaClient` this module needs. Declared structurally so it
 * also accepts an interactive-transaction client, and so tests can pass a stub
 * or a plain `pg` connection without dragging in the generated client.
 */
export interface RawQueryClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

export interface AdvanceSequenceResult {
  /** Fully-qualified sequence name as Postgres reports it, e.g. `public."User_id_seq"`. */
  sequence: string;
  /** Sequence high-water mark before the call. 0 when it had never been used. */
  before: number;
  /**
   * High-water mark after the call — the greatest id now spoken for, never less
   * than `before`. 0 means nothing has been handed out yet and the next id is 1.
   */
  after: number;
  /** True when this call actually moved the sequence forward. */
  moved: boolean;
}

// Table/column names are interpolated (Postgres cannot parameterise an
// identifier), so they are restricted to a plain unquoted-identifier shape.
// Every call site passes a literal, but the guard keeps that true.
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * `bigint` columns arrive as `BigInt` through Prisma and as a string through the
 * raw `pg` driver. Normalise both, and refuse anything that would silently lose
 * precision.
 */
function toSafeNumber(value: unknown, label: string): number {
  const n = typeof value === 'bigint' || typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) {
    throw new Error(`advanceSequence: ${label} is not a safe integer (got ${String(value)})`);
  }
  return n;
}

/**
 * Advance `table`'s identity sequence so the next `nextval()` cannot collide
 * with an existing row. Monotonic: it will never lower the sequence, so it is
 * safe to re-run against a database that has grown real rows since the last run.
 *
 * @param atLeast Floor the caller wants guaranteed (e.g. the top of a seed's
 *   hardcoded id range). Only ever raises the result — it can never pull the
 *   sequence below `max(id)` or below where the sequence already sits.
 */
export async function advanceSequence(
  client: RawQueryClient,
  table: string,
  column = 'id',
  atLeast = 0,
): Promise<AdvanceSequenceResult> {
  if (!IDENTIFIER.test(table)) {
    throw new Error(`advanceSequence: unsafe table name ${JSON.stringify(table)}`);
  }
  if (!IDENTIFIER.test(column)) {
    throw new Error(`advanceSequence: unsafe column name ${JSON.stringify(column)}`);
  }
  if (!Number.isSafeInteger(atLeast) || atLeast < 0) {
    throw new Error(`advanceSequence: atLeast must be a non-negative safe integer (got ${atLeast})`);
  }

  // Resolve the sequence and read its current position up front. `before` is
  // read here rather than alongside the setval below because a volatile
  // `setval()` and a read of the same sequence in one target list have no
  // guaranteed evaluation order.
  //
  // `pg_sequence_last_value()` returns NULL whenever the sequence's is_called
  // is false — a sequence that has handed out nothing, or one just reset with
  // `ALTER SEQUENCE … RESTART WITH n`. Collapsing that to 0 is right for the
  // first case and harmless for the second: the max(id) operand below still
  // floors the result, so a RESTART's spare headroom is dropped but the
  // sequence can never land on a live row. Reading `last_value` instead would
  // report 1 on a fresh sequence and burn id 1.
  const probe = await client.$queryRawUnsafe<Array<{ sequence: string | null; before: unknown }>>(
    `SELECT pg_get_serial_sequence($1, $2) AS sequence,
            COALESCE(pg_sequence_last_value(pg_get_serial_sequence($1, $2)::regclass), 0) AS before`,
    `"${table}"`,
    column,
  );

  const sequence = probe[0]?.sequence ?? null;
  if (sequence === null) {
    throw new Error(
      `advanceSequence: "${table}"."${column}" owns no sequence — ` +
        'is it an autoincrement column? (cuid/uuid keys have no sequence to advance)',
    );
  }
  const before = toSafeNumber(probe[0]?.before, 'current sequence value');

  // One statement, so max(id) and the write cannot drift apart across a
  // round-trip. GREATEST is what makes this monotonic. Note this takes no lock
  // on the table: `MAX(id)` sees only this statement's snapshot, so a
  // concurrent uncommitted insert of an explicit id is invisible to it. That is
  // acceptable here because seeds are single-writer dev scripts, and re-running
  // one repairs whatever the last run missed.
  //
  // The `GREATEST(v.target, 1)` / `v.target >= 1` pair handles the empty-table
  // case: a sequence cannot be set below its minvalue of 1, and passing
  // is_called=false leaves id 1 available instead of skipping it. `after` is
  // reported as the computed target rather than setval's return value, because
  // setval echoes the value it wrote (1) even when is_called=false says nothing
  // has been handed out.
  const advanced = await client.$queryRawUnsafe<Array<{ after: unknown; applied: unknown }>>(
    `SELECT v.target AS after,
            setval($1::regclass, GREATEST(v.target, 1), v.target >= 1) AS applied
       FROM (
         SELECT GREATEST(
                  (SELECT COALESCE(MAX("${column}"), 0) FROM "${table}"),
                  COALESCE(pg_sequence_last_value($1::regclass), 0),
                  $2::bigint
                ) AS target
       ) v`,
    sequence,
    atLeast,
  );

  const after = toSafeNumber(advanced[0]?.after, 'new sequence value');
  return { sequence, before, after, moved: after > before };
}
