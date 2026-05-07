// SRS §4.3.6 — diff builder for ProfileAuditLog rows.
// Produces a `{ before, after }` shape per changed field; unchanged keys are
// omitted so the JSON column stays small and queryable.

export type FieldDiff = { before: unknown; after: unknown };
export type DiffMap = Record<string, FieldDiff>;

const isPlainEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => isPlainEqual(v, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
};

export function buildDiff<T extends Record<string, unknown>>(before: T, after: T): DiffMap {
  const diff: DiffMap = {};
  const keys = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    const b = before[k as keyof T];
    const a = after[k as keyof T];
    if (!isPlainEqual(b, a)) {
      diff[k] = { before: b, after: a };
    }
  }
  return diff;
}

export const isDiffEmpty = (d: DiffMap): boolean => Object.keys(d).length === 0;
