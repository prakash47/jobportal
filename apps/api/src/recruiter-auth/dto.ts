import { z } from 'zod';

const PASSWORD_RE = /^(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]).{8,}$/;
const passwordSchema = z
  .string()
  .regex(
    PASSWORD_RE,
    'Password must be 8+ chars and include at least one digit and one special character',
  );

// SRS §4.9.1 — recruiter registration. A single "Email ID" doubles as the
// login identifier and the address we send the verification link to (there is
// no separate work-email field anymore). CompanyName is the public display
// name; we derive the URL slug via slugify() in the service.
export const RegisterRecruiterDto = z.object({
  email: z.string().email().toLowerCase(),
  password: passwordSchema,
  name: z.string().min(1).max(120),
  companyName: z.string().min(1).max(200),
});
export type RegisterRecruiterInput = z.infer<typeof RegisterRecruiterDto>;

// Recruiter self-service password change (Settings → Change Password). The
// current password gates the change; the new one must clear the same strength
// bar as registration and differ from the current one. The service re-checks
// strength + verifies the current password (the DTO is UX, the API is trust).
export const ChangePasswordDto = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: 'New password must be different from the current password',
    path: ['newPassword'],
  });
export type ChangePasswordInput = z.infer<typeof ChangePasswordDto>;
