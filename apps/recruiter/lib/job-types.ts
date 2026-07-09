// Job-posting product types for the "Post a Job" flow (Naukri-style product
// selector). This is UI/product config only — there is no Job.jobType column
// yet (it lands with the Phase 3 migration). Free Job + Internship are always
// available; Hot Vacancy + SMB Pack are inherently paid and gated behind
// seeded-OFF flags (CLAUDE.md §0/§4), rendering as locked "upgrade" cards on
// Day 0.

export type JobType = 'FREE' | 'HOT_VACANCY' | 'SMB' | 'INTERNSHIP';

export interface JobTypeMeta {
  type: JobType;
  label: string;
  tagline: string;
  /** Short "what you get" bullets shown on the selector card. */
  features: string[];
  /**
   * Feature-flag key that must be ON for this type to be selectable. `null`
   * means always available (free, no gate). When the flag is OFF the card
   * renders locked with an "upgrade" note.
   */
  gateFlag: string | null;
  /** Subtle "recommended" accent — exactly one card carries it. */
  recommended?: boolean;
}

// Order = display order in the selector grid.
export const JOB_TYPES: readonly JobTypeMeta[] = [
  {
    type: 'FREE',
    label: 'Free Job',
    tagline: 'A standard listing at no cost — the fastest way to start hiring.',
    features: ['Baseline search visibility', 'Unlimited applicants', 'One location', 'Live for ~15 days'],
    gateFlag: null,
    recommended: true,
  },
  {
    type: 'HOT_VACANCY',
    label: 'Hot Vacancy',
    tagline: 'Boosted to the top of search with employer branding for urgent, high-visibility roles.',
    features: ['Top-of-search boost', '“Featured” tag + branding', 'Up to 3 must-have skills', 'Wider candidate reach'],
    gateFlag: 'recruiter.hot_vacancy.enabled',
  },
  {
    type: 'SMB',
    label: 'SMB Pack',
    tagline: 'A featured post from your subscription pack, plus CV-database search and candidate outreach.',
    features: ['Featured-grade listing', 'Resume-database search', 'Candidate invites', 'Consumed from your pack'],
    gateFlag: 'recruiter.smb_pack.enabled',
  },
  {
    type: 'INTERNSHIP',
    label: 'Internship',
    tagline: 'For interns and trainees — stipend-based, with duration and flexible work modes.',
    features: ['Monthly stipend (not CTC)', 'Internship duration', 'Part-time / flexible / WFH', 'No experience required'],
    gateFlag: null,
  },
] as const;

export function jobTypeMeta(type: JobType): JobTypeMeta {
  const found = JOB_TYPES.find((t) => t.type === type);
  // JOB_TYPES is exhaustive over JobType, so this is unreachable — the throw is
  // a defensive guard that also narrows the return type away from undefined.
  if (!found) throw new Error(`Unknown job type: ${type}`);
  return found;
}
