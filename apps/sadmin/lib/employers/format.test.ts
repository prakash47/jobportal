import { describe, expect, it } from 'vitest';
import {
  accountStateHint,
  clampPage,
  deriveAccountState,
  displayName,
  employersHref,
  formatAccountState,
  formatCompanyRole,
  lastPageFor,
  resolveContact,
  verificationOf,
  type EmployerTeamMember,
} from './format';

// A recruiter row with sane defaults; each test overrides only what it is about.
function member(over: Partial<EmployerTeamMember> = {}): EmployerTeamMember {
  return {
    id: 1,
    name: 'Priya Sharma',
    email: 'priya@example.in',
    contactPhone: null,
    designation: null,
    companyRole: 'MEMBER',
    deactivatedAt: null,
    joinedAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  };
}

describe('displayName', () => {
  it('prefers the name', () => {
    expect(displayName({ name: 'Priya Sharma', email: 'p@x.in' })).toBe('Priya Sharma');
  });

  // User.name is NOT NULL but nothing stops it being blank, and the email is the
  // only always-present unique identifier.
  it.each([
    ['', 'p@x.in'],
    ['   ', 'p@x.in'],
  ])('falls back to the email when the name is blank (%j)', (name, email) => {
    expect(displayName({ name, email })).toBe(email);
  });
});

describe('resolveContact', () => {
  it('returns null for a company nobody has ever registered for', () => {
    expect(resolveContact([])).toBeNull();
  });

  it('picks the active owner', () => {
    const owner = member({ id: 2, companyRole: 'OWNER' });
    const other = member({ id: 3, companyRole: 'ADMIN' });
    const got = resolveContact([other, owner]);
    expect(got?.person.id).toBe(2);
    expect(got?.isStandIn).toBe(false);
  });

  // Deactivation revokes sessions and blocks re-authentication, so a removed
  // owner is not reachable and must not be offered as the contact.
  it('skips a deactivated owner in favour of an active admin, flagged as a stand-in', () => {
    const removedOwner = member({
      id: 2,
      companyRole: 'OWNER',
      deactivatedAt: new Date('2026-06-01T00:00:00Z'),
    });
    const admin = member({ id: 3, companyRole: 'ADMIN' });
    const got = resolveContact([removedOwner, admin]);
    expect(got?.person.id).toBe(3);
    expect(got?.isStandIn).toBe(true);
  });

  it('returns null when every recruiter has been removed', () => {
    const gone = new Date('2026-06-01T00:00:00Z');
    expect(
      resolveContact([
        member({ id: 2, companyRole: 'OWNER', deactivatedAt: gone }),
        member({ id: 3, deactivatedAt: gone }),
      ]),
    ).toBeNull();
  });

  // The ranking must not depend on the Prisma enum's declaration order, which is
  // what a bare `orderBy: { companyRole: 'asc' }` would silently rely on.
  it('ranks admin above member when there is no owner', () => {
    const got = resolveContact([
      member({ id: 5, companyRole: 'MEMBER' }),
      member({ id: 4, companyRole: 'ADMIN' }),
    ]);
    expect(got?.person.id).toBe(4);
    expect(got?.isStandIn).toBe(true);
  });

  // Nothing in the database prevents a second OWNER — the "last owner" rule is
  // enforced in the recruiter service, not by a constraint.
  it('breaks a two-owner tie on join date, then id', () => {
    const later = member({
      id: 2,
      companyRole: 'OWNER',
      joinedAt: new Date('2026-03-01T00:00:00Z'),
    });
    const earlier = member({
      id: 9,
      companyRole: 'OWNER',
      joinedAt: new Date('2026-01-01T00:00:00Z'),
    });
    expect(resolveContact([later, earlier])?.person.id).toBe(9);

    const sameDay = new Date('2026-01-01T00:00:00Z');
    const a = member({ id: 7, companyRole: 'OWNER', joinedAt: sameDay });
    const b = member({ id: 3, companyRole: 'OWNER', joinedAt: sameDay });
    expect(resolveContact([a, b])?.person.id).toBe(3);
  });

  it('does not mutate the array it is given', () => {
    const team = [
      member({ id: 5, companyRole: 'MEMBER' }),
      member({ id: 2, companyRole: 'OWNER' }),
    ];
    resolveContact(team);
    expect(team.map((m) => m.id)).toEqual([5, 2]);
  });
});

describe('deriveAccountState', () => {
  it('reports NO_ACCOUNT for a company with no recruiter rows at all', () => {
    // Four of the fourteen companies on a seeded database are exactly this:
    // live jobs, nobody managing them.
    expect(deriveAccountState([])).toBe('NO_ACCOUNT');
  });

  it('reports ACTIVE when at least one recruiter can still sign in', () => {
    expect(
      deriveAccountState([
        member({ id: 2, deactivatedAt: new Date('2026-06-01T00:00:00Z') }),
        member({ id: 3 }),
      ]),
    ).toBe('ACTIVE');
  });

  it('reports DEACTIVATED when every recruiter has been removed', () => {
    expect(deriveAccountState([member({ deactivatedAt: new Date('2026-06-01T00:00:00Z') })])).toBe(
      'DEACTIVATED',
    );
  });
});

describe('labels', () => {
  it.each([
    ['OWNER', 'Owner'],
    ['ADMIN', 'Admin'],
    ['MEMBER', 'Member'],
  ] as const)('formats the in-company role %s', (role, label) => {
    expect(formatCompanyRole(role)).toBe(label);
  });

  it.each([
    ['ACTIVE', 'Active'],
    ['DEACTIVATED', 'Deactivated'],
    ['NO_ACCOUNT', 'No account holder'],
  ] as const)('formats the account state %s', (state, label) => {
    expect(formatAccountState(state)).toBe(label);
  });

  // The two absent states must not read alike: one is an employer that left,
  // the other a company nobody ever signed up for.
  it('explains only the states that need explaining, and distinguishes the two', () => {
    expect(accountStateHint('ACTIVE')).toBeNull();
    expect(accountStateHint('DEACTIVATED')).toMatch(/removed/);
    expect(accountStateHint('NO_ACCOUNT')).toMatch(/registered/);
    expect(accountStateHint('DEACTIVATED')).not.toBe(accountStateHint('NO_ACCOUNT'));
  });
});

describe('verificationOf', () => {
  // The schema states the absence of a CompanyKyc row IS the NOT_SUBMITTED
  // state, and 13 of 14 seeded companies have no row.
  it.each([[null], [undefined]])('treats a missing KYC row as NOT_SUBMITTED (%s)', (kyc) => {
    expect(verificationOf(kyc)).toBe('NOT_SUBMITTED');
  });

  it.each(['PENDING', 'VERIFIED', 'REJECTED', 'NOT_SUBMITTED'] as const)(
    'passes through a present status (%s)',
    (status) => {
      expect(verificationOf({ status })).toBe(status);
    },
  );
});

describe('clampPage', () => {
  it.each([
    [undefined, 1],
    ['', 1],
    ['0', 1],
    ['-3', 1],
    ['abc', 1],
    ['2.5', 1],
    ['1', 1],
    ['7', 7],
  ])('clamps %j to %i', (raw, expected) => {
    expect(clampPage(raw)).toBe(expected);
  });

  // skip is an i64 in Prisma; an unclamped page would overflow rather than
  // render an empty list.
  it('caps an absurd page rather than passing it to skip', () => {
    expect(clampPage('99999999999')).toBe(1_000_000);
  });
});

describe('employersHref', () => {
  it('omits the default page so the canonical URL stays clean', () => {
    expect(employersHref(1)).toBe('/employers');
  });

  it('is basePath-relative — Next adds /sadmin itself', () => {
    expect(employersHref(3)).toBe('/employers?page=3');
    expect(employersHref(3).startsWith('/sadmin')).toBe(false);
  });
});

describe('lastPageFor', () => {
  it.each([
    [0, 20, 1],
    [1, 20, 1],
    [14, 20, 1],
    [20, 20, 1],
    [21, 20, 2],
    [40, 20, 2],
    [41, 20, 3],
  ])('total %i at page size %i spans %i page(s)', (total, size, expected) => {
    expect(lastPageFor(total, size)).toBe(expected);
  });

  it('never divides by zero', () => {
    expect(lastPageFor(10, 0)).toBe(1);
  });
});
