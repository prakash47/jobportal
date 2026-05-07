import { Injectable } from '@nestjs/common';
import {
  type Actor,
  type FeatureFlag,
  type FlagPatch,
  getFlag,
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
}
