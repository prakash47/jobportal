import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const config: NextConfig = {
  reactStrictMode: true,
  // SRS §6.1 rule 5 — never serve a trailing slash.
  trailingSlash: false,

  // Native-module packages that must NOT be bundled by webpack — they
  // require platform-specific binaries that the bundler can't ship.
  // The runtime uses node:require directly instead.
  serverExternalPackages: ['argon2', '@prisma/client', '@prisma/adapter-pg', 'pg'],

  // Workspace packages must be transpiled by Next so consumers in apps/web see
  // the latest TS source from packages/* without a manual build step.
  transpilePackages: [
    '@jobportal/ui',
    '@jobportal/db',
    '@jobportal/search',
    '@jobportal/auth',
    '@jobportal/types',
    '@jobportal/feature-flags',
    '@jobportal/observability',
  ],

  // Image domains — Cloudflare R2 + Cloudflare CDN. Add company logo CDN here
  // when we onboard a third-party logo provider.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: 'cdn.jobportal.com' },
      { protocol: 'https', hostname: 'imagedelivery.net' },
    ],
  },

  // Legacy redirect map. Per SRS §6.3 rule 1, slug drift creates a 301; that
  // path is handled per-feature (job-detail, company-profile) and uses a
  // database `slug_history` lookup. Below is for static legacy paths (e.g.
  // a one-time relaunch) that don't need a DB lookup. Keep this list small;
  // if it grows past ~50 entries, move to a generated map.
  async redirects() {
    return [
      // Example placeholder. Replace / extend as we onboard real legacy paths.
      // {
      //   source: '/jobs.html',
      //   destination: '/',
      //   permanent: true,
      // },
    ];
  },

  // SRS §4.2.10 — Cloudflare edge cache rule for job detail pages: 60s TTL
  // with 1h SWR. Page also exports `revalidate = 60` so Next.js ISR matches.
  // SRS §4.7.1 — companies directory: 1h TTL with 6h SWR.
  async headers() {
    return [
      {
        source: '/job/:slug',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=60, stale-while-revalidate=3600',
          },
        ],
      },
      {
        source: '/companies',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=3600, stale-while-revalidate=21600',
          },
        ],
      },
      // SRS §4.8.1 — career-advice index: 1h TTL with 6h SWR. The detail
      // pages are SSG (generateStaticParams) so Cloudflare honours the
      // Next-emitted s-maxage on the static output.
      {
        source: '/career-advice',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=3600, stale-while-revalidate=21600',
          },
        ],
      },
      // SRS §4.15 — sitemap. Googlebot polls roughly daily; 24h TTL is the
      // right sweet spot. SWR 48h covers the case where regeneration is
      // slow or the origin is briefly unavailable.
      {
        source: '/sitemap.xml',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=86400, stale-while-revalidate=172800',
          },
        ],
      },
      {
        source: '/sitemap/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=86400, stale-while-revalidate=172800',
          },
        ],
      },
      // robots.txt rarely changes. 7d TTL with month-long SWR is generous
      // but a stale robots.txt is harmless — crawlers re-fetch lazily.
      {
        source: '/robots.txt',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=604800, stale-while-revalidate=2592000',
          },
        ],
      },
    ];
  },
};

// Phase 1 item 18 — withSentryConfig adds the webpack plugin for
// sourcemap upload + a few performance-tracing default settings. When
// SENTRY_AUTH_TOKEN is blank (local dev, CI builds without secrets),
// the plugin silently skips the upload — the build still succeeds.
//
// Build the options object dynamically so blank env vars don't survive
// into the call — TypeScript's exactOptionalPropertyTypes rejects an
// explicit `key: undefined` even though the runtime behavior is "skip
// this field".
const sentryOptions: Parameters<typeof withSentryConfig>[1] = {
  sourcemaps: {
    // Sourcemaps are uploaded to Sentry then deleted from the prod
    // bundle so they're not publicly downloadable. Stack-trace
    // resolution happens server-side in Sentry's UI.
    deleteSourcemapsAfterUpload: true,
  },
  // Quieter build output — only warn if upload fails.
  silent: !process.env.CI,
  // Disable telemetry to Sentry's own analytics; we already have our
  // own observability stack.
  telemetry: false,
};
if (process.env.SENTRY_ORG) sentryOptions.org = process.env.SENTRY_ORG;
if (process.env.SENTRY_PROJECT) sentryOptions.project = process.env.SENTRY_PROJECT;
if (process.env.SENTRY_AUTH_TOKEN) sentryOptions.authToken = process.env.SENTRY_AUTH_TOKEN;

export default withSentryConfig(config, sentryOptions);
