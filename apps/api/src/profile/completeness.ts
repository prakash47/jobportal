// SRS §4.3.7 — profile completeness scoring.
//
// 100 points are split across the SRS-listed fields. Heaviest weights go to
// fields recruiters actually filter on (skills, headline, current title) and
// to the resume (proxy for "this profile is real"). The mapping is opinionated
// but stable; tweak only with a follow-up ADR.

export interface CompletenessInput {
  // Fields from User
  name: string | null;
  phone: string | null;
  // Fields from Candidate
  headline: string | null;
  summary: string | null;
  experienceMonths: number | null;
  currentTitle: string | null;
  currentCompanyId: number | null;
  expectedSalaryMinPaise: number | null;
  noticePeriodDays: number | null;
  preferredCityIds: number[];
  skillIds: number[];
  // Counts (from Education / WorkExperience tables)
  educationCount: number;
  experienceCount: number;
  // Resume bookkeeping
  hasActiveResume: boolean;
}

const filled = (v: string | null) => typeof v === 'string' && v.trim().length > 0;

export function computeCompleteness(c: CompletenessInput): number {
  let score = 0;
  if (filled(c.name)) score += 5;
  if (filled(c.phone)) score += 5;
  if (filled(c.headline)) score += 10;
  if (filled(c.summary)) score += 8;
  if (c.experienceMonths !== null && c.experienceMonths >= 0) score += 8;
  if (filled(c.currentTitle)) score += 8;
  if (c.currentCompanyId !== null) score += 6;
  if (c.expectedSalaryMinPaise !== null && c.expectedSalaryMinPaise > 0) score += 6;
  if (c.noticePeriodDays !== null) score += 4;
  if (c.preferredCityIds.length > 0) score += 5;
  if (c.skillIds.length >= 3) score += 15;
  else if (c.skillIds.length > 0) score += 5;
  if (c.educationCount > 0) score += 5;
  if (c.experienceCount > 0) score += 5;
  if (c.hasActiveResume) score += 10;
  // Clamp — guards against future weight typos.
  if (score > 100) return 100;
  if (score < 0) return 0;
  return score;
}
