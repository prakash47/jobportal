// @jobportal/feature-flags — backend-controlled feature flag system (SRS §7, CLAUDE.md §4).
//
// Three-layer enforcement (mandatory):
//   Layer 1 — Next.js middleware (route gate)
//   Layer 2 — Page server component (notFound() if disabled)
//   Layer 3 — API endpoint (last line of defense — non-bypassable)
//
// Flag types: BOOLEAN, TIER_GATED, PERCENTAGE_ROLLOUT, USER_TARGETED, COHORT_TARGETED.
// Implementations follow in feature/feature-flag-system.

export {};
