// Super-admin account for the internal /sadmin portal (apps/sadmin).
//
// Why this lives in the REFERENCE seed (prisma/seed.ts) and not the demo
// overlay: the requirement is that every developer can sign in to the Super
// Admin portal immediately after pulling and running the documented setup.
// `pnpm db:seed` is the root-aliased command every dev already runs, whereas
// `db:seed:demo*` is neither root-aliased nor runnable against a non-local
// DATABASE_URL (both demo entry points hard-refuse). Putting the admin here is
// what makes "pull, seed, log in" actually true on all three machines.
//
// Role: reuses the existing `UserRole.ADMIN`. There is no SUPER_ADMIN tier in
// the schema, and adding one would mean a migration under the schema.prisma
// lock plus an audit of every requireAdmin()/AdminGuard call site. "sadmin" is
// the portal's name, not a privilege level above ADMIN. This account therefore
// also reaches the pre-existing /admin console in apps/web — which is a feature,
// not an accident: nothing could log in there before, since no ADMIN user was
// seeded anywhere and CLAUDE.md §9 assigns the role only by direct DB write.
//
// Hashing: argon2 is called directly with the SAME parameters as demo.ts rather
// than importing hashPassword from @jobportal/auth. That is not laziness —
// @jobportal/auth already depends on @jobportal/db, so importing it here would
// create a circular workspace dependency. demo.ts does the same for the same
// reason. Keep these parameters in sync with packages/auth/src/password.ts.

import argon2 from 'argon2';
import type { PrismaClient } from '../../generated/client';

/** Documented default — see ONBOARDING.md §E and README.md. Override with SADMIN_SEED_PASSWORD. */
const DEFAULT_PASSWORD = 'Admin@123';
const DEFAULT_EMAIL = 'admin@careerqueue.in';

const SUPER_ADMIN_NAME = 'Super Admin';

/** Mirrors seed-demo.ts's locality test so both credential-creating seeds agree on "local". */
const LOOKS_LOCAL =
  /(?:localhost|127\.0\.0\.1|::1|\.local(?::|\/|$)|\.internal(?::|\/|$))/i;

export async function seedSuperAdmin(prisma: PrismaClient): Promise<void> {
  // Read env INSIDE the function, never at module top level.
  //
  // seed.ts loads dotenv with a config() call that sits BETWEEN its imports, but this module is
  // evaluated as part of that import graph — i.e. BEFORE config() runs. A module-level
  // `process.env.SADMIN_SEED_PASSWORD` therefore reads undefined even when the variable IS set in
  // .env, silently ignoring the override the docs promise (verified: setting it in .env left the
  // account on the default password) and, worse, making the guard below compare the default against
  // itself. By the time this function is CALLED, dotenv has run.
  //
  // `||`, not `??`: .env.example ships SADMIN_SEED_EMAIL="" / SADMIN_SEED_PASSWORD="" and everyone
  // copies that file verbatim, so these arrive as EMPTY STRINGS. `??` only falls back on
  // null/undefined, so it would seed an account with an empty email and an empty password. The rest
  // of the repo uses truthy checks for exactly this class of blank-in-.env.example variable
  // (packages/auth/src/cookies.ts's COOKIE_DOMAIN, next.config.ts's SENTRY_* options).
  const SUPER_ADMIN_EMAIL = (process.env.SADMIN_SEED_EMAIL || DEFAULT_EMAIL).toLowerCase();
  const SUPER_ADMIN_PASSWORD = process.env.SADMIN_SEED_PASSWORD || DEFAULT_PASSWORD;

  // The reference seed, unlike the demo seeds, has no local-only guard of its own — it is the seed
  // you would legitimately run against staging or production to populate flags/plans/cities. A
  // committed, publicly-known credential must never survive into such an environment.
  //
  // Defence in depth, mirroring seed-demo.ts, because NODE_ENV alone is NOT a reliable signal here:
  // `pnpm db:seed` runs `tsx prisma/seed.ts` and nothing in that chain sets NODE_ENV, and
  // .env.example does not define it — so an operator pointing DATABASE_URL at staging from their
  // laptop has NODE_ENV undefined and would sail straight past a NODE_ENV-only check.
  //
  //   Guard 1: NODE_ENV must not be 'production'.
  //   Guard 2: DATABASE_URL must look local.
  //
  // Either guard tripping skips ONLY this step while the default password is in use. Skipping
  // rather than throwing is deliberate: the surrounding reference data (flags, plans, cities) is
  // legitimate to plant remotely, so failing the whole seed would be the wrong trade. Setting
  // SADMIN_SEED_PASSWORD to a real secret provisions an admin anywhere, intentionally.
  if (SUPER_ADMIN_PASSWORD === DEFAULT_PASSWORD) {
    const dbUrl = process.env.DATABASE_URL ?? '';
    const unsafe = process.env.NODE_ENV === 'production' || !LOOKS_LOCAL.test(dbUrl);
    if (unsafe) {
      console.warn(
        '  -> SKIPPED: refusing to seed the super admin with the repo default password against ' +
          `a non-local database ("${dbUrl.replace(/:[^@]*@/, ':***@')}"). ` +
          'Set SADMIN_SEED_PASSWORD to provision one deliberately.',
      );
      return;
    }
  }

  const passwordHash = await argon2.hash(SUPER_ADMIN_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  // `passwordHash` is deliberately set in BOTH create and update. The demo
  // seeders set it on create only, which is correct for throwaway demo logins
  // but wrong here: a developer who already has a row for this email (from an
  // earlier run, a manual insert, or a changed password) would silently never
  // converge on the documented credential, and the three machines would drift.
  // The trade-off is explicit — re-running the seed RESETS a locally-changed
  // super-admin password back to the documented one.
  //
  // `role` and `emailVerified` are likewise re-asserted so a row that was
  // created as something else (e.g. a CANDIDATE with this address) is corrected
  // rather than leaving an account that exists but cannot reach the portal.
  //
  // No explicit `id`: the demo seed ends by advancing the User sequence past
  // its own 200001-200020 range, and a hardcoded high id here would be a second
  // constant to keep in step with that one. Plain autoincrement has no such
  // hazard — and since the advance is monotonic (src/sequence.ts), a row this
  // seed allocates above the demo range is never handed out twice.
  const admin = await prisma.user.upsert({
    where: { email: SUPER_ADMIN_EMAIL },
    update: {
      passwordHash,
      role: 'ADMIN',
      emailVerified: true,
    },
    create: {
      email: SUPER_ADMIN_EMAIL,
      passwordHash,
      name: SUPER_ADMIN_NAME,
      role: 'ADMIN',
      emailVerified: true,
      provider: 'LOCAL',
    },
    select: { id: true },
  });

  // Revoke every existing session for this account.
  //
  // The `update` branch above will happily promote a row that someone else created — and
  // registration is public, auto-issues a session, and hands out a 30-day refresh token, while
  // AuthService.refresh() rebuilds its claims from the LIVE user row. So without this, anyone who
  // registered this address first would keep a valid session that silently becomes an ADMIN session
  // the moment the seed runs — including on the run where an operator sets a strong
  // SADMIN_SEED_PASSWORD believing they are provisioning a fresh account.
  //
  // Unconditional rather than only-on-update: it is idempotent, and re-seeding is also exactly when
  // the password is being reset, which should end existing sessions anyway. The only cost is that a
  // developer who re-seeds is signed out of the portal.
  const { count } = await prisma.session.deleteMany({ where: { userId: admin.id } });

  console.log(
    `  -> super admin upserted (${SUPER_ADMIN_EMAIL})` +
      (count > 0 ? `; ${count} pre-existing session(s) revoked` : ''),
  );
}
