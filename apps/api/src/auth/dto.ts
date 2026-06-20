import { z } from 'zod';

const PASSWORD_RE = /^(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]).{8,}$/;
const passwordSchema = z
  .string()
  .regex(PASSWORD_RE, 'Password must be 8+ chars and include at least one digit and one special character');

export const RegisterDto = z.object({
  email: z.string().email().toLowerCase(),
  password: passwordSchema,
  name: z.string().min(1).max(120),
  phone: z.string().min(7).max(20).optional(),
});
export type RegisterInput = z.infer<typeof RegisterDto>;

export const LoginDto = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginDto>;

export const ForgotPasswordDto = z.object({
  email: z.string().email().toLowerCase(),
});
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordDto>;

export const ResetPasswordDto = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordDto>;

// Used by the Google-signup onboarding step (name editable, email locked) and
// any future "edit display name" affordance.
export const UpdateNameDto = z.object({
  name: z.string().min(1).max(120),
});
export type UpdateNameInput = z.infer<typeof UpdateNameDto>;
