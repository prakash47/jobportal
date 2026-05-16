import type { MetadataRoute } from 'next';

// SRS §4.15 — robots.txt. Crawlers should index public pages (homepage,
// search results, job details, company profiles, career-advice articles)
// and stay out of authenticated routes (profile, applications, saved
// jobs, alerts, settings) plus admin + the JSON API.
//
// Robots.txt is not a security boundary — every disallowed path also
// enforces auth + noindex at the page layer. Listing them here keeps a
// well-behaved bot from spending crawl budget on URLs we'd reject
// anyway.

const SITE = process.env.NEXT_PUBLIC_WEB_URL ?? 'https://jobportal.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          // Authenticated dashboards
          '/profile',
          '/profile/',
          '/applications',
          '/applications/',
          '/saved-jobs',
          '/saved-jobs/',
          '/alerts',
          '/alerts/',
          '/settings',
          '/settings/',
          // Auth flow — no SEO value
          '/login',
          '/register',
          '/forgot-password',
          '/reset-password',
          '/verify-email',
          // Admin + JSON API
          '/admin',
          '/admin/',
          '/api/',
        ],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
