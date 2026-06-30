import { z } from 'zod';

// Recruiter Company-Verification (KYC) DTOs. The identifier form is a draft:
// every field is optional and nullable (empty string → cleared) so a recruiter
// can fill it in over several saves before submitting for review.

// GSTIN — 15 chars: 2-digit state code + 10-char PAN + 1 entity digit + 'Z' +
// 1 checksum char. PAN — 10 chars: 5 letters + 4 digits + 1 letter. These are
// FORMAT checks only; live GSTN/MCA registry verification is a Phase-2 follow-up
// (an admin manually reviews for the MVP).
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

// Normalises (trim + uppercase) before validating, so a recruiter typing a
// lowercase GSTIN/PAN still passes and is stored canonically.
function normalizedCode(re: RegExp, message: string) {
  return z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .refine((v) => re.test(v), { message });
}

// Accepts a valid (normalised) code, an empty string (→ cleared), or null.
const optionalGstin = z
  .union([normalizedCode(GSTIN_RE, 'Invalid GSTIN — must be a 15-character GST number'), z.literal('')])
  .nullable()
  .optional();
const optionalPan = z
  .union([normalizedCode(PAN_RE, 'Invalid PAN — must be a 10-character PAN'), z.literal('')])
  .nullable()
  .optional();

// Authorized-signatory ID-proof document classes. Stored as a string on
// CompanyKyc (UI-constrained to this set) — Aadhaar is accepted but the number
// itself is NOT collected here (only the uploaded proof), keeping Aadhaar-number
// handling out of scope per DPDP minimisation.
export const KYC_ID_TYPES = ['PAN', 'AADHAAR', 'PASSPORT', 'VOTER_ID', 'DRIVING_LICENSE'] as const;
const idType = z.enum(KYC_ID_TYPES);

export const SaveKycDto = z
  .object({
    legalName: z.string().max(200).nullable().optional(),
    gstNumber: optionalGstin,
    panNumber: optionalPan,
    registrationNumber: z.string().max(50).nullable().optional(),
    authorizedPersonName: z.string().max(120).nullable().optional(),
    authorizedPersonDesignation: z.string().max(120).nullable().optional(),
    authorizedPersonIdType: z.union([idType, z.literal('')]).nullable().optional(),
  })
  .strict();
export type SaveKycInput = z.infer<typeof SaveKycDto>;

// Document upload — the file arrives via the multipart interceptor; docType is a
// form field. Must match the Prisma KycDocumentType enum.
export const KYC_DOC_TYPES = ['BUSINESS_REGISTRATION', 'AUTHORIZED_PERSON_ID'] as const;
export const UploadKycDocumentDto = z
  .object({
    docType: z.enum(KYC_DOC_TYPES),
  })
  .strict();
export type UploadKycDocumentInput = z.infer<typeof UploadKycDocumentDto>;
