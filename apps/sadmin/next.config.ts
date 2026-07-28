import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const config: NextConfig = {
  // The owner's requirement: this portal is addressed at the /sadmin slug.
  //
  // Page routes, /_next/* assets, <Link href> and router.push() are prefixed
  // automatically, so application code NEVER writes the prefix itself. Writing
  // href="/sadmin/dashboard" would double-apply it and 404; always write
  // href="/dashboard".
  //
  // IMPORTANT EXCEPTION: next/image does NOT prefix a STRING src. `<Image
  // src="/brand/x.png">` — the form apps/web and apps/recruiter both use — would
  // request /brand/x.png while the asset is only served at /sadmin/brand/x.png,
  // and turning the optimizer on does not help because its own `url=` param is
  // un-prefixed too. components/brand/Logo.tsx documents the workaround (static
  // imports, whose /_next/* URL IS prefixed, plus `unoptimized`). Use that
  // pattern for any local image added to this app.
  //
  // Two consequences worth remembering:
  //  • middleware sees the path with the basePath already STRIPPED, so its
  //    matcher and any pathname comparisons stay prefix-free (see middleware.ts).
  //  • NextResponse.redirect(new URL('/x', request.url)) DROPS the basePath and
  //    loops; use request.nextUrl.clone(), which preserves it.
  //
  // basePath is not a cookie scope — the API's access_token cookie is set at
  // path '/' and reaches /sadmin/* normally.
  //
  // This is deliberately the only place the prefix appears: if the portal later
  // moves to its own subdomain with no path, deleting this line converts the
  // whole app with no other edits.
  basePath: '/sadmin',

  reactStrictMode: true,
  trailingSlash: false,

  // Native-module packages that must NOT be bundled — they need platform
  // binaries the bundler cannot ship. The dashboard's RSC reads Postgres
  // directly (reads/writes split), so Prisma lands in the server bundle.
  // apps/recruiter omits this and currently gets away with it; apps/web
  // declares it, and web is the correct reference for a Prisma-reading app.
  serverExternalPackages: ['argon2', '@prisma/client', '@prisma/adapter-pg', 'pg'],

  // Workspace packages ship raw TypeScript (their package.json `main` points at
  // src/index.ts), so Next must transpile every one this app imports. Omitting
  // one produces an opaque parse error at build time, not a helpful message.
  transpilePackages: [
    '@jobportal/ui',
    '@jobportal/db',
    '@jobportal/auth',
    '@jobportal/types',
    '@jobportal/observability',
  ],
};

// Phase 1 item 18 — sourcemap upload + tracing defaults, same shape as the other
// apps. The options object is built conditionally because tsconfig.base sets
// exactOptionalPropertyTypes, which rejects an explicit `key: undefined` even
// though the runtime behaviour is "skip this field".
const sentryOptions: Parameters<typeof withSentryConfig>[1] = {
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  silent: !process.env.CI,
  telemetry: false,
};
if (process.env.SENTRY_ORG) sentryOptions.org = process.env.SENTRY_ORG;
if (process.env.SENTRY_PROJECT) sentryOptions.project = process.env.SENTRY_PROJECT;
if (process.env.SENTRY_AUTH_TOKEN) sentryOptions.authToken = process.env.SENTRY_AUTH_TOKEN;

export default withSentryConfig(config, sentryOptions);
