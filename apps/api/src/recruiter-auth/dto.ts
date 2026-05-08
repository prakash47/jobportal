import { z } from 'zod';

const PASSWORD_RE = /^(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]).{8,}$/;
const passwordSchema = z
  .string()
  .regex(
    PASSWORD_RE,
    'Password must be 8+ chars and include at least one digit and one special character',
  );

// SRS §4.9.1 — recruiter registration. login email + work email are distinct
// fields; the recruiter may use a personal address for login and a corporate
// address for verification. CompanyName is the public display name; we
// derive the URL slug via slugify() in the service.
export const RegisterRecruiterDto = z.object({
  email: z.string().email().toLowerCase(),
  password: passwordSchema,
  name: z.string().min(1).max(120),
  workEmail: z.string().email().toLowerCase(),
  companyName: z.string().min(1).max(200),
});
export type RegisterRecruiterInput = z.infer<typeof RegisterRecruiterDto>;
