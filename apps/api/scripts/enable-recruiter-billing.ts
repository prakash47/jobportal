// Dev helper: switch the recruiter Plans & Billing feature ON (or OFF) in the
// LOCAL database so you can see it in the recruiter portal without the web
// admin console running.
//
// It does two things the feature needs to be visible + buyable:
//   1. Flags (via setFlag → invalidates the running server's flag cache):
//      subscription.system.enabled  (reveals the Billing menu + unlocks the pages)
//      subscription.plans.basic/premium/enterprise.enabled  (per-tier launch)
//   2. Activates the seeded RECRUITER plans (isActive + isPublic) so /plans
//      actually renders cards instead of the empty state.
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

  const res = await prisma.subscriptionPlan.updateMany({
    where: { audience: 'RECRUITER' },
    data: { isActive: enabled, isPublic: enabled },
  });
  console.log(`  ${res.count} RECRUITER plans -> isActive:${enabled}, isPublic:${enabled}`);

  await prisma.$disconnect();
  console.log(
    enabled
      ? '\nRecruiter billing is ON. Refresh the recruiter portal (:3001) — the "Billing" group appears in the sidebar; open Plans & pricing.'
      : '\nRecruiter billing is OFF (Day-0 freemium state restored).',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
