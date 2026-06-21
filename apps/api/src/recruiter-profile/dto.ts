import { z } from 'zod';

// SRS §4.9.1 — recruiter Profile-tab editor. Every field is optional on PATCH;
// a missing key means "no change". Nullable fields additionally accept `null`
// (and the service treats an empty string as `null`) so a recruiter can clear a
// previously-set value. Name fields are non-nullable — you cannot blank them.

const phoneRegex = /^[+0-9 \-()]{6,20}$/;

// Accepts a valid phone, an empty string (→ cleared), or null (→ cleared).
const optionalPhone = z.union([z.string().regex(phoneRegex), z.literal('')]).nullable().optional();

// Accepts a valid http(s) URL (≤300 chars), an empty string, or null.
const optionalUrl = z.union([z.string().url().max(300), z.literal('')]).nullable().optional();

export const COMPANY_TYPES = [
  'STARTUP',
  'INDIAN_MNC',
  'FOREIGN_MNC',
  'PRIVATE',
  'PUBLIC',
  'GOVERNMENT_PSU',
  'NGO_NONPROFIT',
  'PARTNERSHIP',
  'SOLE_PROPRIETORSHIP',
] as const;
const companyType = z.enum(COMPANY_TYPES);

// ---- Recruiter-personal fields (split server-side: name → User, rest → Recruiter)
export const UpdateRecruiterProfileDto = z
  .object({
    name: z.string().min(1).max(120).optional(),
    designation: z.string().max(120).nullable().optional(),
    department: z.string().max(120).nullable().optional(),
    contactPhone: optionalPhone,
    altPocName: z.string().max(120).nullable().optional(),
    altPocEmail: z.union([z.string().email().max(200), z.literal('')]).nullable().optional(),
    altPocPhone: optionalPhone,
  })
  .strict();
export type UpdateRecruiterProfileInput = z.infer<typeof UpdateRecruiterProfileDto>;

// ---- Company fields the recruiter may edit. Excludes slug, ratings,
// workingAtSections (admin-only per SRS §4.7.6), and logoUrl (set via the
// dedicated multipart upload endpoint, never a free-text URL).
export const UpdateRecruiterCompanyDto = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(5_000).nullable().optional(),
    websiteUrl: optionalUrl,
    companyType: companyType.nullable().optional(),
    industryId: z.number().int().positive().nullable().optional(),
    headquartersCityId: z.number().int().positive().nullable().optional(),
    employeeCount: z.string().max(40).nullable().optional(),
    foundedYear: z.number().int().min(1800).max(2100).nullable().optional(),
  })
  .strict();
export type UpdateRecruiterCompanyInput = z.infer<typeof UpdateRecruiterCompanyDto>;
