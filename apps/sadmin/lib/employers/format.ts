// Pure logic for the Employer Management console — contact resolution, account
// state, labels and URL building. No JSX, no Prisma, no `new Date()`: anything
// that needs "now" takes it as an argument, so callers pass one shared anchor
// instant and the tests are deterministic. Same discipline as lib/jobs/format.ts
// and lib/dashboard/chart.ts.
//
// An "employer" here is a Company, not a Recruiter. Several recruiters share one
// Company, so the row key is the company and the person shown beside it is
// derived — which is what this module exists to do honestly.

import type { CompanyType, KycStatus, RecruiterRole } from '@jobportal/db';

/** Companies per page in the master list. Matches the job review queue. */
export const EMPLOYERS_PAGE_SIZE = 20;

/**
 * The subset of a Recruiter (joined to its User) needed to pick a contact and
 * derive an account state. Declared structurally rather than as a Prisma payload
 * type so the unit tests can build one without a generated client.
 */
export interface EmployerTeamMember {
  id: number;
  /** User.name. NOT NULL in the schema, but may be an empty string. */
  name: string;
  email: string;
  contactPhone: string | null;
  designation: string | null;
  companyRole: RecruiterRole;
  /** Soft-remove marker. Non-null means removed: sessions revoked, login blocked. */
  deactivatedAt: Date | null;
  /** Recruiter.createdAt — when this PERSON joined, not when the employer registered. */
  joinedAt: Date;
}

/**
 * User.name is NOT NULL but is not guaranteed non-blank, and the email is the
 * only identifier that is always present and unique. Mirrors what the (authed)
 * layout does for the signed-in admin's own name.
 */
export function displayName(person: Pick<EmployerTeamMember, 'name' | 'email'>): string {
  return person.name.trim() || person.email;
}

// Explicit ranking for who speaks for a company. Sorting on `companyRole`
// directly would appear to work — the Prisma enum happens to be declared
// OWNER, ADMIN, MEMBER, and Postgres orders enum values by declaration order —
// but that is an accident of the declaration, and reordering the enum later
// would silently invert this with nothing failing. Keyed by the enum, so adding
// a role is a compile error here rather than a row that sorts arbitrarily.
const ROLE_PRECEDENCE: Record<RecruiterRole, number> = {
  OWNER: 0,
  ADMIN: 1,
  MEMBER: 2,
};

const ROLE_LABEL: Record<RecruiterRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
};

export function formatCompanyRole(role: RecruiterRole): string {
  return ROLE_LABEL[role];
}

export interface EmployerContact {
  person: EmployerTeamMember;
  /**
   * True when no active OWNER exists and this is a stand-in of a lesser role.
   * The UI always shows the role, so a Member is never mistaken for the owner.
   */
  isStandIn: boolean;
}

/**
 * Who an admin should contact about this employer.
 *
 * Only ACTIVE recruiters are eligible: deactivation revokes sessions and blocks
 * re-authentication, so a removed recruiter cannot be reached through the
 * platform at all. Their absence is reported by the account state instead of
 * being papered over with a name nobody can use.
 *
 * Returns null when the company has no active recruiter — which is a real state,
 * not an error: a company can exist with live jobs and no account holder.
 *
 * Nothing guarantees a single OWNER (there is no partial unique constraint, and
 * the "last owner" check lives in the recruiter service, not the database), so
 * ties break on join date then id — deterministic either way.
 */
export function resolveContact(team: readonly EmployerTeamMember[]): EmployerContact | null {
  const active = team.filter((m) => m.deactivatedAt === null);
  if (active.length === 0) return null;

  const ranked = [...active].sort(
    (a, b) =>
      ROLE_PRECEDENCE[a.companyRole] - ROLE_PRECEDENCE[b.companyRole] ||
      a.joinedAt.getTime() - b.joinedAt.getTime() ||
      a.id - b.id,
  );
  // `active.length > 0` guarantees an element, but noUncheckedIndexedAccess does
  // not narrow on that, so the guard is real rather than defensive noise.
  const person = ranked[0];
  if (!person) return null;

  return { person, isStandIn: person.companyRole !== 'OWNER' };
}

/**
 * Whether this employer has anyone who can sign in.
 *
 * DEACTIVATED and NO_ACCOUNT are deliberately distinct. "Every recruiter was
 * removed" and "nobody ever registered" look identical in the data (no active
 * recruiter) but mean opposite things to an admin: the first is an employer that
 * left, the second is a company that reached the platform some other way — a
 * seeded fixture, or an import — and may still be carrying live jobs with nobody
 * managing them.
 */
export type AccountState = 'ACTIVE' | 'DEACTIVATED' | 'NO_ACCOUNT';

export function deriveAccountState(team: readonly EmployerTeamMember[]): AccountState {
  if (team.length === 0) return 'NO_ACCOUNT';
  return team.some((m) => m.deactivatedAt === null) ? 'ACTIVE' : 'DEACTIVATED';
}

const ACCOUNT_STATE_LABEL: Record<AccountState, string> = {
  ACTIVE: 'Active',
  DEACTIVATED: 'Deactivated',
  NO_ACCOUNT: 'No account holder',
};

export function formatAccountState(state: AccountState): string {
  return ACCOUNT_STATE_LABEL[state];
}

/**
 * One line of plain English for the states that need explaining. ACTIVE is
 * self-evident and gets nothing rather than filler.
 */
const ACCOUNT_STATE_HINT: Record<AccountState, string | null> = {
  ACTIVE: null,
  DEACTIVATED: 'Every recruiter on this company has been removed.',
  NO_ACCOUNT: 'No recruiter has ever registered for this company.',
};

export function accountStateHint(state: AccountState): string | null {
  return ACCOUNT_STATE_HINT[state];
}

/**
 * The absence of a CompanyKyc row IS the NOT_SUBMITTED state — the schema says
 * so explicitly, and 13 of 14 companies on a seeded database have no row at all.
 * Encoded once here so no caller has to remember the `?? 'NOT_SUBMITTED'`.
 */
export function verificationOf(kyc: { status: KycStatus } | null | undefined): KycStatus {
  return kyc?.status ?? 'NOT_SUBMITTED';
}

// Wording matches apps/web's COMPANY_TYPE_LABELS and the recruiter portal's
// profile editor, so all three surfaces describe a company identically. Keyed by
// the Prisma enum rather than `Record<string, string>` (which is what apps/web
// uses), so a member added to CompanyType is a compile error here instead of a
// value that silently falls through to a blank.
const COMPANY_TYPE_LABEL: Record<CompanyType, string> = {
  STARTUP: 'Startup',
  INDIAN_MNC: 'Indian MNC',
  FOREIGN_MNC: 'Foreign MNC',
  PRIVATE: 'Private',
  PUBLIC: 'Public',
  GOVERNMENT_PSU: 'Government / PSU',
  NGO_NONPROFIT: 'NGO / Non-profit',
  PARTNERSHIP: 'Partnership',
  SOLE_PROPRIETORSHIP: 'Sole proprietorship',
};

/** Company.companyType is nullable — only 2 of 14 companies have ever set one. */
export function formatCompanyType(type: string | null): string | null {
  if (!type) return null;
  return COMPANY_TYPE_LABEL[type as CompanyType] ?? null;
}

/**
 * `?page` is user-controlled and feeds Prisma's `skip`, which is an i64. Clamp
 * before it reaches the query so a hand-typed ?page=99999999999 renders an empty
 * page rather than erroring. Mirrors the job review queue's clamp, but lives
 * here so it is actually covered by a test.
 */
export function clampPage(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, 1_000_000);
}

/**
 * Shared by the pagination links and the over-range redirect, so the two can
 * never build different URLs for the same page. Omits the default (page=1) to
 * keep the canonical URL clean. basePath-relative: Next adds '/sadmin' itself.
 */
export function employersHref(page: number): string {
  return page > 1 ? `/employers?page=${page}` : '/employers';
}

/** Last page for a given total, never below 1 so an empty list still has a page 1. */
export function lastPageFor(total: number, pageSize: number): number {
  if (pageSize < 1) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}
