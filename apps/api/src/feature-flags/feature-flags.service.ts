import { Injectable } from '@nestjs/common';
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

@Injectable()
export class FeatureFlagsService {
  list(): Promise<FeatureFlag[]> {
    return listFlags();
  }

  get(key: string): Promise<FeatureFlag | null> {
    return getFlag(key);
  }

  update(key: string, patch: FlagPatch, actor: Actor, reason?: string): Promise<FeatureFlag> {
    return setFlag(key, patch, actor, reason);
  }

  auditLog(opts: { page?: number; flagKey?: string }): Promise<AuditLogPage> {
    return listAuditLog(opts);
  }
}
