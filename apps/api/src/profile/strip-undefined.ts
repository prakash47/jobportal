// Prisma's generated update/create types are incompatible with TypeScript's
// `exactOptionalPropertyTypes: true` because Prisma encodes "no change" as a
// missing key, while exactOptional bans `undefined` values from being assigned
// to optional properties. This helper drops undefined values so the resulting
// object only carries keys the caller actually wants to write.
//
// Treat the return type as the same input type — callers can spread or pass
// it directly into Prisma's data: argument.

export function stripUndefined<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}
