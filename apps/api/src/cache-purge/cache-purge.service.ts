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
