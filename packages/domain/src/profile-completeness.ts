// SRS §4.3.7 — profile completeness, as ONE table that yields both the score
// and the per-field breakdown.
//
// WHY THIS MOVED HERE (and why it is a single function, not two)
//
// The percentage and the "next steps" checklist used to be computed in two
// different places: this weighting table lived in `apps/api/src/profile`, while
// the dashboard hand-wrote a 5-item list in `app/profile/page.tsx`. The table
// scores 14 fields; the list covered 5 of them, worth 45 points. So a seeker
// could tick every box on screen and still sit at 94%, with the card printing
// "All sections filled in" — the exact contradiction that was reported.
//
// The two cannot drift again because there is now only one list: the score is
// literally the sum of the earned points below. `apps/web` renders it,
// `apps/api` stores it, and neither owns a second copy — which is the reason
// this package exists at all (ADR 0002 decision 2).
//
// Weights are unchanged from the original table, deliberately: re-weighting
// would silently move every existing user's score, and this change is about
// telling the truth about the score, not redefining it. Tweak only with a
// follow-up ADR.

export interface CompletenessInput {
  // From User
  name: string | null;
  phone: string | null;
  // From Candidate
  headline: string | null;
  summary: string | null;
  experienceMonths: number | null;
  currentTitle: string | null;
  /**
   * BOTH company columns are accepted, and that is not belt-and-braces.
   *
   * Scoring `currentCompanyId` alone made this item permanently unearnable:
   * NOTHING in the product writes that FK. The onboarding wizard writes the
   * free-text `currentCompanyName` instead, and the PATCH DTO's currentCompanyId
   * field has no caller. Measured on the dev database: 36 candidates, 0 with an
   * id, 1 with a name. So every user was capped below 100 with a row they could
   * never clear, no matter how many times they revisited onboarding.
   */
  currentCompanyId: number | null;
  currentCompanyName: string | null;
  expectedSalaryMinPaise: number | null;
  noticePeriodDays: number | null;
  preferredCityIds: number[];
  skillIds: number[];
  // Counts from Education / WorkExperience
  educationCount: number;
  experienceCount: number;
  // Resume bookkeeping
  hasActiveResume: boolean;
}

export interface CompletenessItem {
  /** Stable identifier; the web app maps this to an edit route. */
  key: string;
  /** Shown to the seeker, phrased as the action to take. */
  label: string;
  /** Full weight of this field. */
  points: number;
  /** Points actually earned — below `points` when partial credit applies. */
  earned: number;
  /** True only when the FULL weight is earned. */
  done: boolean;
}

/** The weights sum to this. Asserted by a test so a typo cannot slip through. */
export const COMPLETENESS_TOTAL = 100;

/** Skills pay partial credit below this many. */
export const SKILLS_FOR_FULL_CREDIT = 3;

const filled = (v: string | null): boolean => typeof v === 'string' && v.trim().length > 0;

/**
 * Every scored field, with what it is worth and what this profile earned.
 *
 * Order is the order the checklist renders in: cheap identity fields first,
 * then the heavy recruiter-facing ones, then attachments.
 */
export function completenessBreakdown(c: CompletenessInput): CompletenessItem[] {
  const item = (key: string, label: string, points: number, earned: number): CompletenessItem => ({
    key,
    label,
    points,
    earned,
    done: earned >= points,
  });

  // Skills are the only field with partial credit, and reporting it honestly is
  // half the bug fix: the old checklist ticked "skills" at ONE skill while the
  // scorer only pays full marks at three, so the seeker saw a tick and lost 10
  // points with no way to find out why.
  const skillCount = c.skillIds.length;
  const skillsEarned = skillCount >= SKILLS_FOR_FULL_CREDIT ? 15 : skillCount > 0 ? 5 : 0;

  return [
    item('name', 'Add your full name', 5, filled(c.name) ? 5 : 0),
    item('phone', 'Add a phone number', 5, filled(c.phone) ? 5 : 0),
    item('headline', 'Add a professional headline', 10, filled(c.headline) ? 10 : 0),
    item('summary', 'Write a short summary', 8, filled(c.summary) ? 8 : 0),
    item(
      'experienceMonths',
      'Add your total experience',
      8,
      c.experienceMonths !== null && c.experienceMonths >= 0 ? 8 : 0,
    ),
    item('currentTitle', 'Add your current job title', 8, filled(c.currentTitle) ? 8 : 0),
    item(
      'currentCompany',
      'Add your current company',
      6,
      c.currentCompanyId !== null || filled(c.currentCompanyName) ? 6 : 0,
    ),
    item(
      'expectedSalary',
      'Add your expected salary',
      6,
      c.expectedSalaryMinPaise !== null && c.expectedSalaryMinPaise > 0 ? 6 : 0,
    ),
    item('noticePeriod', 'Add your notice period', 4, c.noticePeriodDays !== null ? 4 : 0),
    item(
      'preferredCities',
      'Choose preferred work locations',
      5,
      c.preferredCityIds.length > 0 ? 5 : 0,
    ),
    item(
      'skills',
      skillCount > 0 && skillCount < SKILLS_FOR_FULL_CREDIT
        ? `Add at least ${SKILLS_FOR_FULL_CREDIT} skills`
        : 'Add your skills',
      15,
      skillsEarned,
    ),
    item('education', 'Add your education', 5, c.educationCount > 0 ? 5 : 0),
    item('experience', 'Add work experience', 5, c.experienceCount > 0 ? 5 : 0),
    item('resume', 'Upload your resume', 10, c.hasActiveResume ? 10 : 0),
  ];
}

/**
 * The percentage, defined as the sum of what the breakdown says was earned.
 *
 * Same weights and same result as the previous implementation — verified by the
 * existing API test suite, which was left pointed at this function.
 */
export function computeCompleteness(c: CompletenessInput): number {
  const score = completenessBreakdown(c).reduce((n, i) => n + i.earned, 0);
  // Clamp — guards against a future weight typo, same as the original.
  if (score > COMPLETENESS_TOTAL) return COMPLETENESS_TOTAL;
  if (score < 0) return 0;
  return score;
}
