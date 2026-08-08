export { computeCanonicalRedirect } from './middleware-core';
export {
  lowercasePath,
  normalizeQuery,
  sortMultiCitySegment,
  stripTrailingSlash,
} from './normalize';
// The slug parsers/builders moved to @jobportal/domain so apps/api can apply
// the identical canonical-URL rules (ADR 0002). Re-exported here so the
// middleware and route handlers that import from this barrel are untouched.
export {
  buildCompanySlug,
  buildJobSlug,
  buildMultiCitySlug,
  buildWorkingAtSlug,
  parseCompanySlug,
  parseJobSlug,
  parseMultiCitySlug,
  parseSkillJobsInCitySlug,
  parseWorkingAtSlug,
  slugify,
  type ParsedJobSlug,
} from '@jobportal/domain/slug';
