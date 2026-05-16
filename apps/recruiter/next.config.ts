import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const config: NextConfig = {
  reactStrictMode: true,
  trailingSlash: false,
  transpilePackages: [
    '@jobportal/ui',
    '@jobportal/db',
    '@jobportal/search',
    '@jobportal/auth',
    '@jobportal/types',
    '@jobportal/observability',
  ],
};

// Phase 1 item 18 — withSentryConfig adds the webpack plugin for
// sourcemap upload + a few performance-tracing default settings. Same
// shape as apps/web (see web's next.config.ts for the full rationale).
// Build the options object dynamically so blank env vars (local dev,
// CI without secrets) don't survive into the call — TypeScript's
// exactOptionalPropertyTypes rejects an explicit `key: undefined`
// even though the runtime behavior is "skip this field".
const sentryOptions: Parameters<typeof withSentryConfig>[1] = {
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  silent: !process.env.CI,
  telemetry: false,
};
if (process.env.SENTRY_ORG) sentryOptions.org = process.env.SENTRY_ORG;
if (process.env.SENTRY_PROJECT) sentryOptions.project = process.env.SENTRY_PROJECT;
if (process.env.SENTRY_AUTH_TOKEN) sentryOptions.authToken = process.env.SENTRY_AUTH_TOKEN;

export default withSentryConfig(config, sentryOptions);
