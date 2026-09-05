// SRS §4.3.7 — profile completeness.
//
// The weighting table itself now lives in `@jobportal/domain` so that the API
// (which STORES the score on Candidate.profileCompleteness) and the website
// (which RENDERS both the percentage and the "next steps" checklist) compute it
// from one list rather than two.
//
// They used to disagree: this table scored 14 fields while the dashboard
// hand-wrote a 5-item checklist, so a seeker could tick every visible box and
// still sit at 94% under a card reading "All sections filled in".
//
// Re-exported rather than deleted so existing imports and this module's test
// suite keep working unchanged.
export {
  computeCompleteness,
  completenessBreakdown,
  COMPLETENESS_TOTAL,
  SKILLS_FOR_FULL_CREDIT,
  type CompletenessInput,
  type CompletenessItem,
} from '@jobportal/domain/profile-completeness';
