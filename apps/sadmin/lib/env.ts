// Fail fast, by name, when this app's server environment is incomplete.
//
// WHY THIS EXISTS
// ---------------
// Next.js loads .env from the APP directory, never the monorepo root, and
// .gitignore matches a bare `.env` at every depth — so a clone has none and each
// of apps/{api,web,recruiter,sadmin,services} needs its own copy. Miss the one
// for sadmin and the portal still boots, still renders /login perfectly (that
// route touches neither the JWT nor the database), and then silently refuses
// every correct password: verifyAccessToken throws, requireSuperAdmin() reads
// that as "anonymous", and you are redirected back to the form you just
// submitted. No error, no log, no Sentry event.
//
// Every OTHER app fails loudly in that state — they hit Prisma and die on
// `SASL: client password must be a string`. sadmin is the exception only because
// its auth gate runs BEFORE the first query, so the loud failure never happens.
// This assertion restores it: the server refuses to start and names the variable.
//
// Deliberately NOT a Zod schema: @jobportal/types is an empty stub and this must
// run before anything else loads, so it stays dependency-free.

type RequiredVar = readonly [name: string, usedFor: string];

const REQUIRED: readonly RequiredVar[] = [
  ['JWT_ACCESS_SECRET', 'verifying the admin session cookie minted by apps/api'],
  ['DATABASE_URL', 'reading dashboard KPIs straight from Postgres (reads/writes split)'],
];

/**
 * Throws when a variable the sadmin SERVER cannot work without is absent.
 *
 * Only checks presence. A value that is present but WRONG — most commonly a
 * JWT_ACCESS_SECRET that has drifted from the one apps/api is running with —
 * cannot be detected here; lib/auth/server-session.ts logs that case at the
 * point the mismatch actually shows up.
 */
export function assertServerEnv(): void {
  const missing = REQUIRED.filter(([name]) => !process.env[name]?.trim());
  if (missing.length === 0) return;

  const lines = missing.map(([name, usedFor]) => `  - ${name}  (needed for ${usedFor})`);

  throw new Error(
    [
      '',
      'apps/sadmin cannot start — required environment variables are missing:',
      ...lines,
      '',
      'Next.js reads .env from the app directory, not the monorepo root, so this app',
      'needs its own copy. From the repo root:',
      '',
      '  cp .env apps/sadmin/.env          (PowerShell: Copy-Item .env apps/sadmin/.env)',
      '',
      'Use the SAME file the other apps use — a JWT_ACCESS_SECRET that differs from',
      "apps/api's produces a working sign-in that lands right back on the login page.",
      '',
    ].join('\n'),
  );
}
