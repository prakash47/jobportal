/**
 * Ceiling for any value that will be used as a database id.
 *
 * Every `id` column in this schema is a Prisma `Int`, i.e. Postgres `int4`.
 * Handing Prisma a larger number does not return "no rows" — it throws, which
 * escapes as an unhandled 5xx and, on a public route, lets an anonymous caller
 * generate 500s and Sentry noise by changing one digit in a URL.
 *
 * Validating ids at the boundary is therefore not defensive tidiness; it is the
 * difference between a 400 and a 500. Rejecting the value beats clamping it,
 * because a caller asking about id 3000000000 has asked a malformed question,
 * not a question whose answer is id 2147483647.
 */
export const MAX_INT32 = 2_147_483_647;

/** Is this a usable database id — a positive integer inside int4? */
export function isInt32Id(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= MAX_INT32;
}
