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

export default config;
