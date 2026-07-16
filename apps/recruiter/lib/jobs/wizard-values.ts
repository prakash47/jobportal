import type { WizardInitialValues } from '../../components/jobs/PostJobWizard';

// The Job fields the posting form can re-seed from — a subset of both the
// full Prisma Job row (the edit page's server read) and the JSON body of
// GET /recruiter/jobs/:id (the template/duplicate deep-copy fetch). id,
// canonicalSlug and status are deliberately absent: prefill is a pure
// content copy; the edit page passes the job id separately.
export interface JobFormSource {
  title: string;
  description: string;
  descriptionMarkdown: string | null;
  shortDescription: string | null;
  skillIds: number[];
  primaryCityId: number | null;
  cityIds: number[];
  industryId: number | null;
  functionalAreaId: number | null;
  localityId: number | null;
  employmentType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACTOR' | 'INTERN';
  workMode: 'ONSITE' | 'REMOTE' | 'HYBRID';
  openings: number | null;
  qualifications: string | null;
  internshipDurationMonths: number | null;
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  salaryMinPaise: number | null;
  salaryMaxPaise: number | null;
}

/** Map a job row into the posting form's prefill shape (template / duplicate /
 * edit all share this — one mapping, no drift). */
export function jobToWizardInitialValues(job: JobFormSource): WizardInitialValues {
  return {
    title: job.title,
    description: job.description,
    descriptionMarkdown: job.descriptionMarkdown,
    shortDescription: job.shortDescription,
    skillIds: job.skillIds ?? [],
    primaryCityId: job.primaryCityId,
    cityIds: job.cityIds ?? [],
    industryId: job.industryId,
    functionalAreaId: job.functionalAreaId,
    localityId: job.localityId,
    employmentType: job.employmentType,
    workMode: job.workMode,
    openings: job.openings,
    qualifications: job.qualifications,
    internshipDurationMonths: job.internshipDurationMonths,
    experienceMinYears: job.experienceMinYears,
    experienceMaxYears: job.experienceMaxYears,
    salaryMinPaise: job.salaryMinPaise,
    salaryMaxPaise: job.salaryMaxPaise,
  };
}
