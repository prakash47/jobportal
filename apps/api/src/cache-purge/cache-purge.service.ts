import { Injectable, Logger } from '@nestjs/common';

// Stub for FR-4.2.11 — purges Cloudflare's edge cache for a given job URL.
// Real call site arrives with feature/recruiter-portal (where job edits
// happen). When CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE_ID are set, this
// hits the Cloudflare Purge API; otherwise it logs the would-be purge.
@Injectable()
export class CachePurgeService {
  private readonly logger = new Logger(CachePurgeService.name);

  async purgeJob(canonicalSlug: string): Promise<void> {
    const origin = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';
    const url = `${origin}/job/${canonicalSlug}`;

    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;

    if (!apiToken || !zoneId) {
      this.logger.log(`(stub) would purge ${url}`);
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
          body: JSON.stringify({ files: [url] }),
        },
      );
      if (!res.ok) {
        this.logger.warn(`purge failed for ${url}: ${res.status}`);
        return;
      }
      this.logger.log(`purged ${url}`);
    } catch (err: unknown) {
      this.logger.error(`purge error for ${url}`, err instanceof Error ? err.stack : String(err));
    }
  }
}
