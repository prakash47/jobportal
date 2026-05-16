import { Injectable, Logger } from '@nestjs/common';
import {
  type Actor,
  type AuditLogPage,
  type FeatureFlag,
  type FlagPatch,
  getFlag,
  listAuditLog,
  listFlags,
  setFlag,
} from '@jobportal/feature-flags';
import { CachePurgeService, pathsForFlag } from '../cache-purge/cache-purge.service';

@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);

  constructor(private readonly cachePurge: CachePurgeService) {}

  list(): Promise<FeatureFlag[]> {
    return listFlags();
  }

  get(key: string): Promise<FeatureFlag | null> {
    return getFlag(key);
  }

  async update(
    key: string,
    patch: FlagPatch,
    actor: Actor,
    reason?: string,
  ): Promise<FeatureFlag> {
    const updated = await setFlag(key, patch, actor, reason);
    // SRS §4.16.3 — affected URL patterns dropped from Cloudflare. Fire-
    // and-log: the toggle's success doesn't depend on Cloudflare and the
    // 30s in-process flag cache + Redis pub/sub already invalidate
    // origin-side via setFlag(). A failed purge just means the edge will
    // serve stale for up to its existing TTL.
    this.cachePurge.purgePaths(pathsForFlag(key)).catch((err: unknown) => {
      this.logger.warn(
        `cache purge for flag ${key} failed: ${(err as Error).message}`,
      );
    });
    return updated;
  }

  auditLog(opts: {
    page?: number | undefined;
    flagKey?: string | undefined;
  }): Promise<AuditLogPage> {
    return listAuditLog(opts);
  }
}
