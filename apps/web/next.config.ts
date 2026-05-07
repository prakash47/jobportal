import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // SRS §6.1 rule 5 — never serve a trailing slash.
  trailingSlash: false,

  // Workspace packages must be transpiled by Next so consumers in apps/web see
  // the latest TS source from packages/* without a manual build step.
  transpilePackages: [
    '@jobportal/ui',
    '@jobportal/db',
    '@jobportal/search',
    '@jobportal/auth',
    '@jobportal/types',
    '@jobportal/feature-flags',
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
};

export default config;
