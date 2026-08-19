import { Injectable, Logger } from '@nestjs/common';

// Stub for FR-4.2.11 / FR-4.16.3 — purges Cloudflare's edge cache. When
// CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE_ID are set, hits the Cloudflare
// Purge API; otherwise it logs the would-be purge.
//
// purgeJob() is the FR-4.2.11 entry point (per-job slug). purgePaths() is
// the generic FR-4.16.3 entry point (admin flag toggles); the per-flag
// path mapping lives in pathsForFlag() below.
@Injectable()
export class CachePurgeService {
  private readonly logger = new Logger(CachePurgeService.name);

  async purgeJob(canonicalSlug: string): Promise<void> {
    const origin = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';
    await this.purge([`${origin}/job/${canonicalSlug}`]);
  }

  async purgePaths(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const origin = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';
    const urls = Array.from(new Set(paths.map((p) => `${origin}${p.startsWith('/') ? p : '/' + p}`)));
    await this.purge(urls);
  }

  private async purge(urls: string[]): Promise<void> {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;

    if (!apiToken || !zoneId) {
      this.logger.log(`(stub) would purge ${urls.length} url(s): ${urls.join(', ')}`);
      return;
    }

    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ files: urls }),
        },
      );
      if (!res.ok) {
        this.logger.warn(`purge failed for ${urls.join(', ')}: ${res.status}`);
        return;
      }
      this.logger.log(`purged ${urls.length} url(s)`);
    } catch (err: unknown) {
      this.logger.error(
        `purge error for ${urls.join(', ')}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}

// SRS §4.16.3 — flag→paths mapping. Hardcoded because the set is small
// (~26 flags) and stable; a configurable mapping is YAGNI for MVP. The
// default ['/'] is defensive: any flag CAN affect global header / nav,
// so when in doubt we purge the homepage. Add a more specific entry
// here when a flag has a narrow blast radius worth optimizing for.
const PATH_MAP: Record<string, string[]> = {
  'services.menu.visible': ['/'],
  'services.resume_display.enabled': ['/services', '/services/resume-display'],
  'services.resume_writing.enabled': ['/services', '/services/resume-writing'],
  'services.resume_writing_executive.enabled': ['/services', '/services/resume-writing-executive'],
  'services.ai_interview.enabled': ['/services', '/services/ai-interview'],
  'services.priority_applicant.enabled': ['/services', '/services/priority-applicant'],
  'services.profile_spotlight.enabled': ['/services', '/services/profile-spotlight'],
  'services.recruiter_connect.enabled': ['/services', '/services/recruiter-connect'],
  'subscription.system.enabled': ['/', '/pricing'],
  'subscription.pricing_page.visible': ['/pricing'],
  // Recruiter-portal-only surface (/plans + /billing), and those pages are
  // force-dynamic so there is nothing cached to purge. Mapped explicitly to []
  // so it doesn't hit the defensive ['/'] default and needlessly purge the
  // job-seeker homepage, which this flag cannot affect.
  'recruiter.plans_visible': [],
  // Decides whether a NEW posting goes live immediately or waits for admin
  // review. It changes nothing about any page that is already cached — jobs
  // already live stay live either way — so, like recruiter.plans_visible, it is
  // mapped explicitly to [] rather than falling through to the defensive ['/']
  // and purging the seeker homepage for no reason.
  'moderation.jobs.enabled': [],
  // Gates the "Report this job" control, whose ONLY surface is /job/:slug — a
  // per-posting path that cannot be enumerated here, and the one page the
  // defensive ['/'] default would NOT have purged. Purging the seeker homepage
  // instead would be purging a page this flag cannot affect, so it is mapped
  // explicitly to [] like the two above.
  //
  // Nothing is lost by that: /job/[slug] is ISR with `export const revalidate =
  // 60`, so a toggle propagates within a minute on its own — comfortably close
  // to the 30s the flag's own cache holds the old value for anyway.
  'moderation.reports.enabled': [],
  // Gates the write actions on /sadmin/subscriptions. Every surface it touches
  // lives in apps/sadmin, which is behind auth, noindex, and served by a
  // different app than the Cloudflare-cached seeker site — so there is no cached
  // page anywhere for this flag to invalidate. Mapped explicitly to [] so it
  // doesn't hit the defensive ['/'] default and purge the seeker homepage, which
  // it cannot affect.
  'killswitch.admin_subscription_write': [],
  // Gates the write actions on /sadmin/reports. Same reasoning as the entry
  // above: every surface it touches is in apps/sadmin, behind auth and noindex,
  // served by a different app than the Cloudflare-cached seeker site.
  //
  // Note this is the ADMIN half. Its intake counterpart is
  // 'moderation.reports.enabled' above — also [], but for a different reason
  // (its one surface is a per-posting path that cannot be enumerated).
  'killswitch.admin_report_write': [],
  // Admin job deletion. Mapped for the same reason as the two above, and it was
  // simply MISSED when that flag shipped: without an entry it fell through to
  // the defensive ['/'] and purged the job-seeker HOMEPAGE every time an
  // operator toggled an admin-only killswitch — a page the flag cannot affect,
  // and the single most expensive path on the site to evict.
  'killswitch.admin_job_delete': [],
  // Gates the CSV export on /sadmin/transactions. Same reasoning as the three
  // above: every surface it touches lives in apps/sadmin, behind auth and
  // noindex, served by a different app than the Cloudflare-cached seeker site.
  //
  // Mapped explicitly rather than left to the defensive ['/'] default. That
  // omission has now shipped TWICE on admin-only killswitches — first
  // 'moderation.reports.enabled', then 'killswitch.admin_job_delete' — and both
  // times the effect was to evict the job-seeker HOMEPAGE, the most expensive
  // path on the site, every time an operator toggled a switch that cannot
  // change it. A new admin flag with no entry here is a regression, not an
  // oversight; cache-purge.service.test.ts asserts this key is present.
  'killswitch.admin_transaction_export': [],
  // Gates dispatching a broadcast from /sadmin/broadcasts. Same reasoning as the
  // four above, and mapped up-front rather than after the fact: the omission the
  // comment above describes has now shipped twice, so a new admin-only
  // killswitch arriving without an entry here is a regression by default.
  //
  // Worth stating explicitly for this one: a broadcast REACHES every user, so
  // the instinct that it must therefore affect a public page is wrong. It
  // reaches them by email and by the recruiter bell — neither of which is a
  // Cloudflare-cached path, and the bell is rendered per-request behind auth.
  // There is no cached page anywhere for this flag to invalidate.
  'killswitch.admin_broadcast_send': [],
};

export function pathsForFlag(flagKey: string): string[] {
  const explicit = PATH_MAP[flagKey];
  if (explicit) return explicit;
  // Defensive default: any flag-gated UI is, at worst, in the global
  // header. Purge the homepage so the most-trafficked path doesn't
  // serve stale state. Per-page caches (job detail, company) are
  // handled by their own purge paths and aren't flag-driven.
  return ['/'];
}
