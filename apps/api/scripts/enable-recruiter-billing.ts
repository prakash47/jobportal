// Dev helper: switch the recruiter Plans & Billing feature ON (or OFF) in the
// LOCAL database so you can see it in the recruiter portal without the web
// admin console running.
//
// It does two things the feature needs to be visible + buyable:
//   1. Flags (via setFlag → invalidates the running server's flag cache):
//      subscription.system.enabled  (unlocks PURCHASING)
//      subscription.plans.basic/premium/enterprise.enabled  (per-tier launch)
//   2. Ensures the seeded RECRUITER plans are listed (isActive + isPublic).
//
// NOTE: this script no longer controls VISIBILITY. The Billing nav group and
// the /plans + /billing pages are gated by recruiter.plans_visible, which is
// seeded ON — every recruiter sees them and their Free-plan state by default.
// What this script toggles is whether paid plans can be BOUGHT. Accordingly
// `--off` leaves the plans LISTED (matching the seed) and only turns the
// purchase flags off, so the CTAs fall back to a disabled "Coming soon".
//
// Local dev only. Refuses to run against a non-local DATABASE_URL.
//
//   tsx apps/api/scripts/enable-recruiter-billing.ts          # turn ON
//   tsx apps/api/scripts/enable-recruiter-billing.ts --off    # turn OFF
import { config } from 'dotenv';
import { resolve } from 'node:path';

// Load the same env the running API uses (DATABASE_URL must be present before
// @jobportal/db is imported — done dynamically in main() so Prisma instantiates
// after this runs).
config({ path: resolve(__dirname, '../.env') });
config({ path: resolve(__dirname, '../../../.env') });

const LOCAL_DB = /localhost|127\.0\.0\.1|::1|\.local|\.internal/;

const FLAGS = [
  'subscription.system.enabled',
  'subscription.plans.basic.enabled',
  'subscription.plans.premium.enabled',
  'subscription.plans.enterprise.enabled',
];

async function main(): Promise<void> {
  const off = process.argv.includes('--off');
  const enabled = !off;

  const dbUrl = process.env.DATABASE_URL ?? '';
  if (!LOCAL_DB.test(dbUrl)) {
    console.error('Refusing to run: DATABASE_URL does not look local.');
    process.exit(1);
  }

  const { prisma } = await import('@jobportal/db');
  const { setFlag } = await import('@jobportal/feature-flags');

  // FlagAuditLog.changedById has no FK; use a real admin if one exists, else 1.
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
  const actor = { userId: admin?.id ?? 1, email: 'dev-script@local', role: 'ADMIN' as const };

  for (const key of FLAGS) {
    await setFlag(key, { enabled }, actor, `dev enable-recruiter-billing (${enabled ? 'on' : 'off'})`);
    console.log(`  flag ${key} -> enabled:${enabled}`);
  }

  // Listing is what lets /plans render the catalogue; purchasability is the
  // flags' job above. Narrowed to rows still in the unlisted default so this
  // never resurrects a plan an admin deliberately delisted (same rule as the
  // seed's backfill).
  const res = await prisma.subscriptionPlan.updateMany({
    where: { audience: 'RECRUITER', isActive: false, isPublic: false },
    data: { isActive: true, isPublic: true },
  });
  console.log(`  ${res.count} unlisted RECRUITER plans -> listed`);

  await prisma.$disconnect();
  console.log(
    enabled
      ? '\nRecruiter billing is ON — paid plans are now purchasable on /plans (:3001).'
      : '\nRecruiter billing is OFF (Day-0 freemium state restored). /plans stays visible with the Free plan current and paid CTAs disabled.',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
