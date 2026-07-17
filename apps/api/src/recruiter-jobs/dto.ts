import { z } from 'zod';

const employmentType = z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'INTERN']);
const workMode = z.enum(['ONSITE', 'REMOTE', 'HYBRID']);
const jobType = z.enum(['FREE', 'HOT_VACANCY', 'SMB', 'INTERNSHIP']);

// SRS §4.9.3 — wizard payload. publishMode determines the final status:
//   DRAFT → status='DRAFT' (saved, not visible, doesn't consume quota)
//   PUBLISH → status='ACTIVE' (or 'PENDING_MODERATION' when the moderation
//             flag is on); consumes quota.
const baseFields = z
  .object({
    title: z.string().min(3).max(200),
    description: z.string().min(10).max(50_000),
    // Post a Job Phase 4 — optional rich JD (Markdown). description stays the
    // plain-text fallback used by JSON-LD/search.
    descriptionMarkdown: z.string().max(50_000).optional(),
    shortDescription: z.string().max(280).optional(),
    primaryCityId: z.number().int().positive().optional(),
    cityIds: z.array(z.number().int().positive()).max(10).optional(),
    skillIds: z.array(z.number().int().positive()).max(20).optional(),
    industryId: z.number().int().positive().optional(),
    functionalAreaId: z.number().int().positive().optional(),
    employmentType: employmentType.optional(),
    workMode: workMode.optional(),
    salaryMinPaise: z.number().int().min(0).optional(),
    salaryMaxPaise: z.number().int().min(0).optional(),
    experienceMinYears: z.number().int().min(0).max(60).optional(),
    experienceMaxYears: z.number().int().min(0).max(60).optional(),
    expiresAt: z.iso.datetime().optional(),
    // Post a Job Phase 3 — rich Job Details fields.
    jobType: jobType.optional(),
    openings: z.number().int().min(1).max(9999).optional(),
    qualifications: z.string().max(2000).optional(),
    // Area/locality: either an existing id (dropdown) OR a free-typed name that
    // the service find-or-creates as a City-scoped Locality.
    localityId: z.number().int().positive().optional(),
    localityName: z.string().min(1).max(120).optional(),
    internshipDurationMonths: z.number().int().min(1).max(36).optional(),
  })
  .strict();

/**
 * The mandatory fields a job needs to go LIVE (SRS §4.9.3), returned as a
 * human-labelled list of the ones missing/invalid on `f`. Single source of
 * truth shared by CreateRecruiterJobDto's PUBLISH refine and
 * RecruiterJobsService.publish() so the two make-live paths enforce the exact
 * same set and can never drift. DRAFT saves stay lenient — only title +
 * description (min 10), which baseFields already requires.
 */
export interface PublishableFields {
  title?: string | null | undefined;
  description?: string | null | undefined;
  functionalAreaId?: number | null | undefined;
  openings?: number | null | undefined;
  primaryCityId?: number | null | undefined;
}

export function missingPublishFields(f: PublishableFields): string[] {
  const missing: string[] = [];
  if (!f.title || f.title.trim().length < 3) missing.push('title');
  if (!f.description || f.description.trim().length < 10) missing.push('description');
  if (f.functionalAreaId == null) missing.push('department');
  if (f.openings == null || f.openings < 1) missing.push('number of openings');
  if (f.primaryCityId == null) missing.push('city');
  return missing;
}

export const CreateRecruiterJobDto = baseFields
  .extend({ publishMode: z.enum(['DRAFT', 'PUBLISH']) })
  .refine(
    (v) =>
      v.salaryMinPaise === undefined ||
      v.salaryMaxPaise === undefined ||
      v.salaryMinPaise <= v.salaryMaxPaise,
    { message: 'salaryMin must be <= salaryMax' },
  )
  .refine(
    (v) =>
      v.experienceMinYears === undefined ||
      v.experienceMaxYears === undefined ||
      v.experienceMinYears <= v.experienceMaxYears,
    { message: 'experienceMin must be <= experienceMax' },
  )
  // Going LIVE (publishMode PUBLISH) needs the full mandatory set — not just the
  // title + description baseFields enforces. Without this, a direct API call
  // (`{ publishMode:'PUBLISH', title, description }`) would create an ACTIVE,
  // indexed job with no city/department/openings; the wizard gates these
  // client-side but the API is the only trusted enforcement point (CLAUDE.md
  // §4). DRAFT stays lenient. Same set publish() enforces on a stored draft.
  .refine((v) => v.publishMode !== 'PUBLISH' || missingPublishFields(v).length === 0, {
    // Dynamic message (Zod 4 passes it the issue) so the 400 names only the
    // fields that are actually missing, mirroring publish()'s message.
    error: (iss) =>
      `To publish, these fields are required: ${missingPublishFields(iss.input as PublishableFields).join(', ')}.`,
  });
export type CreateRecruiterJobInput = z.infer<typeof CreateRecruiterJobDto>;

// PATCH allows the same shape minus publishMode; status transitions go via
// dedicated /close /reopen endpoints to keep the surface explicit.
// Clearable optional fields additionally accept `null` so the edit form can
// blank a previously-set value (PATCH semantics: omitted = unchanged,
// null = clear). Required-for-publish fields (title, description,
// primaryCityId, functionalAreaId…) stay non-nullable — omit to keep them.
export const UpdateRecruiterJobDto = baseFields
  .partial()
  .extend({
    shortDescription: z.string().max(280).nullable().optional(),
    industryId: z.number().int().positive().nullable().optional(),
    salaryMinPaise: z.number().int().min(0).nullable().optional(),
    salaryMaxPaise: z.number().int().min(0).nullable().optional(),
    experienceMinYears: z.number().int().min(0).max(60).nullable().optional(),
    experienceMaxYears: z.number().int().min(0).max(60).nullable().optional(),
    qualifications: z.string().max(2000).nullable().optional(),
    localityId: z.number().int().positive().nullable().optional(),
    internshipDurationMonths: z.number().int().min(1).max(36).nullable().optional(),
  })
  .strict()
  // Same ordering guards as create, null-aware (null = clearing that side).
  // The edit form always sends both sides of each range, so this fully covers
  // the UI path; a hand-rolled one-sided PATCH can still invert against the
  // stored other side (accepted — same trust level as the other partial
  // fields, and the form never produces it).
  .refine(
    (v) =>
      v.salaryMinPaise == null || v.salaryMaxPaise == null || v.salaryMinPaise <= v.salaryMaxPaise,
    { message: 'salaryMin must be <= salaryMax' },
  )
  .refine(
    (v) =>
      v.experienceMinYears == null ||
      v.experienceMaxYears == null ||
      v.experienceMinYears <= v.experienceMaxYears,
    { message: 'experienceMin must be <= experienceMax' },
  );
export type UpdateRecruiterJobInput = z.infer<typeof UpdateRecruiterJobDto>;

export const ListRecruiterJobsQueryDto = z
  .object({
    status: z
      .enum(['ALL', 'DRAFT', 'PENDING_MODERATION', 'ACTIVE', 'EXPIRED', 'CLOSED'])
      .optional(),
    page: z.coerce.number().int().min(1).optional(),
  })
  .strict();
export type ListRecruiterJobsQuery = z.infer<typeof ListRecruiterJobsQueryDto>;

// Post a Job Phase 4 — live sidebar widgets (read-only).
export const SalaryTrendsQueryDto = z
  .object({
    title: z.string().max(200).optional(),
    cityId: z.coerce.number().int().positive().optional(),
  })
  .strict();
export type SalaryTrendsQuery = z.infer<typeof SalaryTrendsQueryDto>;

export const ReachQueryDto = z
  .object({
    cityId: z.coerce.number().int().positive().optional(),
    // comma-separated skill ids (from the query string)
    skillIds: z.string().max(200).optional(),
    experienceMonths: z.coerce.number().int().min(0).max(720).optional(),
  })
  .strict();
export type ReachQuery = z.infer<typeof ReachQueryDto>;
