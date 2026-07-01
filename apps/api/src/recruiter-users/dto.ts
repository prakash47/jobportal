import { z } from 'zod';

// Same strength bar as recruiter registration / change-password (packages/auth
// isStrongPassword). The invited teammate sets this on accept; the service
// re-checks (the DTO is UX, the API is the trust boundary).
const PASSWORD_RE = /^(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;
const passwordSchema = z
  .string()
  .regex(
    PASSWORD_RE,
    'Password must be 8+ chars and include at least one digit and one special character',
  );

const companyRoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER']);
const levelSchema = z.enum(['EDIT', 'READ_ONLY', 'NONE']);

// Partial per-module override map. `.strict()` so a mistyped module key is a 400
// rather than a silently-ignored no-op (the service still normalizes on read).
const permissionsSchema = z
  .object({
    jobs: levelSchema,
    applicants: levelSchema,
    company_profile: levelSchema,
    verification: levelSchema,
    notifications: levelSchema,
  })
  .partial()
  .strict();

// Invite a teammate by email with a pre-assigned role + optional per-module
// permission overrides. The caller's authority to grant the chosen role is
// enforced in the service (an ADMIN cannot mint OWNER/ADMIN).
export const InviteUserDto = z
  .object({
    email: z.string().email().toLowerCase(),
    companyRole: companyRoleSchema.default('MEMBER'),
    permissions: permissionsSchema.optional(),
  })
  .strict();
export type InviteUserInput = z.infer<typeof InviteUserDto>;

// Edit an existing teammate's role and/or per-module permissions. At least one
// of the two must be present.
export const UpdateUserDto = z
  .object({
    companyRole: companyRoleSchema.optional(),
    permissions: permissionsSchema.optional(),
  })
  .strict()
  .refine((d) => d.companyRole !== undefined || d.permissions !== undefined, {
    message: 'Provide a role and/or permissions to update',
  });
export type UpdateUserInput = z.infer<typeof UpdateUserDto>;

// Accept an emailed invitation: the token binds the invitee's email + company +
// role; they set a display name + password to create the account.
export const AcceptInviteDto = z
  .object({
    token: z.string().min(1),
    name: z.string().min(1).max(120),
    password: passwordSchema,
  })
  .strict();
export type AcceptInviteInput = z.infer<typeof AcceptInviteDto>;
