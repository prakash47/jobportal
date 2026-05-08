// @jobportal/feature-flags — backend-controlled feature flag system (SRS §7).
// Three-layer enforcement (middleware / page / API) per CLAUDE.md §4.

export { CRITICAL_FLAGS, FLAG, isCriticalFlag, type FlagKey } from './keys';
export type {
  Actor,
  EvaluationContext,
  EvaluationReason,
  EvaluationResult,
  FeatureFlag,
  FlagAuditLog,
  FlagPatch,
} from './types';
export { evaluate } from './evaluator';
export { bucket } from './hash';
export {
  evaluateFlag,
  getFlag,
  isFlagEnabled,
  listAuditLog,
  listFlags,
  setFlag,
  type AuditLogEntry,
  type AuditLogPage,
} from './api';
export { disconnectCache, invalidateFlag } from './cache';
