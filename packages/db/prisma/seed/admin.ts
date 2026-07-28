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

/** Documented default — see README/ONBOARDING. Override with SADMIN_SEED_PASSWORD. */
const DEFAULT_PASSWORD = 'Admin@123';

const SUPER_ADMIN_EMAIL = (process.env.SADMIN_SEED_EMAIL ?? 'admin@careerqueue.in').toLowerCase();
const SUPER_ADMIN_PASSWORD = process.env.SADMIN_SEED_PASSWORD ?? DEFAULT_PASSWORD;
const SUPER_ADMIN_NAME = 'Super Admin';

export async function seedSuperAdmin(prisma: PrismaClient): Promise<void> {
  // The reference seed, unlike the demo seeds, has NO local-database guard — it
  // is the seed you would legitimately run against staging or production to
  // populate flags/plans/cities. A committed, publicly-known credential must
  // therefore never survive into such an environment. Skip loudly rather than
  // throw: failing the whole seed would block the legitimate reference data
  // from being planted, and an operator who genuinely wants an admin there can
  // set SADMIN_SEED_PASSWORD to a real secret.
  if (process.env.NODE_ENV === 'production' && SUPER_ADMIN_PASSWORD === DEFAULT_PASSWORD) {
    console.warn(
      '  -> SKIPPED: refusing to seed the super admin with the default password in production. ' +
        'Set SADMIN_SEED_PASSWORD to provision one.',
    );
    return;
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
  // No explicit `id`: the demo seed ends by advancing the User sequence with
  // setval(..., 200020), so a hardcoded high id here could later be handed out
  // a second time by the sequence. Plain autoincrement has no such hazard.
  await prisma.user.upsert({
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
  });

  console.log(`  -> super admin upserted (${SUPER_ADMIN_EMAIL})`);
}
