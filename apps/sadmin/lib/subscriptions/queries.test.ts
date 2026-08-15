import { describe, expect, it } from 'vitest';
import { subscriptionWhere } from './queries';

const NOW = new Date('2026-08-15T12:00:00.000Z');

// Prisma's WhereInput is a deep optional tree; these helpers keep the assertions
// readable without casting at every call site.
type Where = ReturnType<typeof subscriptionWhere>;
function andOf(where: Where): Record<string, unknown>[] {
  return (where.AND ?? []) as Record<string, unknown>[];
}

describe('subscriptionWhere', () => {
  it('always scopes to recruiter, company-scoped subscriptions', () => {
    // Both halves are needed: companyId alone would admit a candidate plan that
    // somehow carried one, and audience alone would admit a candidate
    // subscription. Owner decision 2026-08-15 — recruiter plans only.
    for (const tab of ['ACTIVE', 'LAPSED', 'CANCELLED', 'ALL'] as const) {
      const and = andOf(subscriptionWhere(tab, NOW));
      expect(and).toContainEqual({ companyId: { not: null } });
      expect(and).toContainEqual({ plan: { audience: 'RECRUITER' } });
    }
  });

  it('ACTIVE requires a live status AND an unexpired period', () => {
    const and = andOf(subscriptionWhere('ACTIVE', NOW));
    expect(and).toContainEqual({
      status: { in: ['ACTIVE', 'TRIALING'] },
      currentPeriodEnd: { gt: NOW },
    });
  });

  it('CANCELLED filters on the status column alone', () => {
    expect(andOf(subscriptionWhere('CANCELLED', NOW))).toContainEqual({ status: 'CANCELLED' });
  });

  it('LAPSED is the negation of live, so no status can fall out of every tab', () => {
    const and = andOf(subscriptionWhere('LAPSED', NOW));
    expect(and).toContainEqual({
      NOT: { status: 'CANCELLED' },
      OR: [{ status: { notIn: ['ACTIVE', 'TRIALING'] } }, { currentPeriodEnd: { lte: NOW } }],
    });
  });

  it('ALL applies no state filter at all', () => {
    const and = andOf(subscriptionWhere('ALL', NOW));
    expect(and).toHaveLength(2);
  });

  it('escapes LIKE wildcards so ?q=% is not a match-everything', () => {
    const and = andOf(subscriptionWhere('ALL', NOW, '%'));
    const search = and.find((c) => 'OR' in c) as { OR: Record<string, never>[] } | undefined;
    expect(JSON.stringify(search)).toContain('\\\\%');
  });

  it('searches company name and plan name', () => {
    const and = andOf(subscriptionWhere('ALL', NOW, 'acme'));
    const search = JSON.stringify(and.find((c) => 'OR' in c));
    expect(search).toContain('company');
    expect(search).toContain('plan');
    expect(search).toContain('insensitive');
  });

  // Regression: the search clause and the LAPSED clause are BOTH `OR`s. Merged
  // into one object the second would overwrite the first and the search would be
  // silently dropped on exactly one tab — the same "clicking a tab wipes the
  // admin's search" failure the shared href builder exists to prevent. Composed
  // as separate AND elements they cannot collide, and this asserts BOTH survive.
  it('keeps the search AND the state filter on the LAPSED tab', () => {
    const and = andOf(subscriptionWhere('LAPSED', NOW, 'acme'));
    const serialized = JSON.stringify(and);
    expect(serialized).toContain('acme');
    expect(serialized).toContain('currentPeriodEnd');
    const orClauses = and.filter((c) => 'OR' in c);
    expect(orClauses).toHaveLength(2);
  });

  it('omits the search clause entirely when there is no query', () => {
    expect(andOf(subscriptionWhere('LAPSED', NOW)).filter((c) => 'OR' in c)).toHaveLength(1);
  });
});
