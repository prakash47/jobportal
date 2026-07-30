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

// Step 2 of the reset — the emailed 6-digit code. Constrained to exactly six
// digits so a malformed guess never reaches the attempt budget: spending a slot
// on input that could not possibly be a code would let an attacker exhaust a
// victim's attempts with junk.
export const VerifyResetOtpDto = z.object({
  email: z.string().email().toLowerCase(),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
});
export type VerifyResetOtpInput = z.infer<typeof VerifyResetOtpDto>;

// Step 3 — spend the one-time ticket minted by step 2. The `ticket` replaced the
// emailed link's `token`: the code is verified once and never travels again.
export const ResetPasswordDto = z.object({
  ticket: z.string().min(1),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordDto>;

// Used by the Google-signup onboarding step (name editable, email locked) and
// any future "edit display name" affordance.
export const UpdateNameDto = z.object({
  name: z.string().min(1).max(120),
});
export type UpdateNameInput = z.infer<typeof UpdateNameDto>;
