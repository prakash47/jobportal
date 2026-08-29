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

/**
 * Website registration — RegisterDto plus proof the address is real.
 *
 * A SEPARATE schema rather than a field on RegisterDto, because the mobile
 * controller parses RegisterDto and the owner's decision is that the app keeps
 * working unchanged until its two-step flow ships. Extending the shared schema
 * would have broken it the moment this merged.
 *
 * `signupId` is deliberately NOT optional here: optional would leave the exact
 * hole this closes reachable by omitting the field.
 */
export const RegisterWithOtpDto = RegisterDto.extend({
  signupId: z.string().min(1).max(128),
});
export type RegisterWithOtpInput = z.infer<typeof RegisterWithOtpDto>;

export const LoginDto = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginDto>;

// Mobile refresh/logout (ADR 0002 decision 1). A native client has no cookie
// jar, so the refresh token travels in the request body on the /v1/auth/mobile
// surface instead of the `refresh_token` cookie the three web apps use. The
// browser endpoints are untouched — this is the documented divergence from
// CLAUDE.md §9, and it applies to this surface only.
export const MobileRefreshDto = z.object({
  refreshToken: z.string().min(1),
});
export type MobileRefreshInput = z.infer<typeof MobileRefreshDto>;

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

// Mobile social sign-in (ADR 0002). The client obtains an ID token on-device —
// Google via google_sign_in, Apple via Sign in with Apple — and posts it here.
//
// The token is the ONLY credential: nothing else in these bodies is trusted.
// In particular there is deliberately no `email` field, because accepting one
// would invite a caller to claim an address the provider never vouched for.
const idToken = z
  .string()
  .min(1)
  // A JWT this large is already far past anything Google or Apple issues;
  // the cap stops an unbounded body reaching the verifier.
  .max(8192);

export const MobileGoogleDto = z.object({ idToken }).strict();
export type MobileGoogleInput = z.infer<typeof MobileGoogleDto>;

export const MobileAppleDto = z
  .object({
    idToken,
    // Apple returns the display name exactly ONCE, on first authorisation, to
    // the client and never inside the token — so the client has to relay it.
    // Used only when CREATING a user; it can never rename an existing account.
    name: z.string().trim().min(1).max(120).optional(),
  })
  .strict();
export type MobileAppleInput = z.infer<typeof MobileAppleDto>;

// Seeker signup email verification (SRS §4.12). EMAIL only — no phone channel,
// because no SMS provider is configured and seekers are the drop-off-sensitive
// audience.

export const RequestSignupOtpDto = z
  .object({
    email: z.string().email().toLowerCase(),
    name: z.string().trim().min(1).max(120),
    // Omitted on the first request; echoed back on a resend so the same
    // challenge row is replaced rather than a second one created.
    signupId: z.string().min(1).max(128).optional(),
  })
  .strict();
export type RequestSignupOtpInput = z.infer<typeof RequestSignupOtpDto>;

export const VerifySignupOtpDto = z
  .object({
    signupId: z.string().min(1).max(128),
    // Exactly six digits. `.length(6)` rather than a number type: a leading
    // zero must survive, and Number would silently eat it.
    code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  })
  .strict();
export type VerifySignupOtpInput = z.infer<typeof VerifySignupOtpDto>;
