// SRS §4.16 — request schemas for the Roles & Permissions console.
//
// Zod, hand-called with safeParse() in the controller. There is no
// ValidationPipe and no class-validator anywhere in apps/api; a DTO written as a
// decorated class here would validate nothing at all.

import { z } from 'zod';
import {
  ADMIN_ACCESS_LEVELS,
  ASSIGNABLE_ADMIN_STAFF_ROLES,
  type AdminModule,
} from '@jobportal/domain/admin-permissions';

// Same strength bar as recruiter registration / accept-invite (packages/auth
// isStrongPassword). The invited staffer sets this on accept; the service
// re-checks, because the DTO is UX and the API is the trust boundary.
const PASSWORD_RE = /^(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;
const passwordSchema = z
  .string()
  .regex(
    PASSWORD_RE,
    'Password must be 8+ chars and include at least one digit and one special character',
  );

// Derived from ASSIGNABLE_ADMIN_STAFF_ROLES rather than re-typed, so SUPER_ADMIN
// cannot re-enter through a second list that someone forgets to keep in step.
// That array deliberately excludes it: the tier able to grant every other tier
// stays seed-or-psql only, which is the property FR-4.12.10 exists to protect.
const staffRoleSchema = z.enum(ASSIGNABLE_ADMIN_STAFF_ROLES);

const levelSchema = z.enum(ADMIN_ACCESS_LEVELS);

// Per-module override map. Seven modules, not eight: `system` is absent by
// design and its absence is enforced twice over.
//
// `system` gates feature flags AND staff management — the two levers that can
// grant everything else — so clampSystem() in @jobportal/domain forces it back to
// the role default on every resolve, in both directions. A `system` key accepted
// here would therefore be silently swallowed downstream, and a control that
// appears to do something and does nothing is worse than no control. `.strict()`
// turns it into a 400 instead.
//
// The `satisfies` clause is the drift guard: adding a module to ADMIN_MODULES
// without listing it here is a COMPILE error, so a new module cannot end up
// quietly non-overridable.
const permissionsShape = {
  support: levelSchema,
  moderation: levelSchema,
  finance: levelSchema,
  users: levelSchema,
  verification: levelSchema,
  otp_reveal: levelSchema,
  communications: levelSchema,
} satisfies Record<Exclude<AdminModule, 'system'>, typeof levelSchema>;

// `.strict()` so a mistyped module key — or `system` — is a 400 rather than a
// silently-ignored no-op.
const permissionsSchema = z.object(permissionsShape).partial().strict();

// Invite someone to become platform staff at a pre-assigned tier, with optional
// per-module overrides on top of that tier's defaults.
export const InviteStaffDto = z
  .object({
    email: z.string().email().toLowerCase(),
    staffRole: staffRoleSchema,
    permissions: permissionsSchema.optional(),
  })
  .strict();
export type InviteStaffInput = z.infer<typeof InviteStaffDto>;

// Edit an existing staffer's tier and/or per-module overrides. At least one of
// the two must be present, matching UpdateUserDto in recruiter-users.
export const UpdateStaffDto = z
  .object({
    staffRole: staffRoleSchema.optional(),
    permissions: permissionsSchema.optional(),
  })
  .strict()
  .refine((d) => d.staffRole !== undefined || d.permissions !== undefined, {
    message: 'Provide a role and/or permissions to update',
  });
export type UpdateStaffInput = z.infer<typeof UpdateStaffDto>;

// Accept an emailed staff invitation. The token binds the invitee's email, tier
// and overrides; they supply only a display name and a password.
export const AcceptStaffInviteDto = z
  .object({
    token: z.string().min(1),
    name: z.string().min(1).max(120),
    password: passwordSchema,
  })
  .strict();
export type AcceptStaffInviteInput = z.infer<typeof AcceptStaffInviteDto>;
