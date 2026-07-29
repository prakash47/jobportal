import { z } from 'zod';

const PASSWORD_RE = /^(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]).{8,}$/;
const passwordSchema = z
  .string()
  .regex(
    PASSWORD_RE,
    'Password must be 8+ chars and include at least one digit and one special character',
  );

// Character-for-character the rule already used by profile/dto.ts and
// recruiter-profile/dto.ts. Copied rather than invented: the platform stores
// free-form phone text (see the User.phoneVerified comment in schema.prisma),
// and a stricter rule here would let a recruiter verify a number they could
// then never save on their own profile. Consolidating all three copies into one
// shared module is a separate cleanup — this is not a new rule.
export const PHONE_RE = /^[+0-9 \-()]{6,20}$/;

// 320 = the RFC 5321 maximum length of an email address. The same bound applies
// to an OTP `destination`, which is an email address on the EMAIL channel.
const emailSchema = z.string().email().max(320);

// The per-channel shape of an OTP destination. Lives here, next to the DTOs, so
// the register DTO and the OTP service enforce exactly one rule per channel.
export function isValidOtpDestination(
  channel: 'EMAIL' | 'PHONE',
  destination: string,
): boolean {
  return channel === 'EMAIL'
    ? emailSchema.safeParse(destination).success
    : PHONE_RE.test(destination);
}

// SRS §4.9.1 — recruiter registration. A single "Email ID" doubles as the
// login identifier and the address the signup code was sent to (there is no
// separate work-email field anymore). CompanyName is the public display name;
// we derive the URL slug via slugify() in the service.
//
// There is deliberately NO emailVerified / phoneVerified / otpVerified boolean
// on this DTO. Verification is a server-side fact read back off the two
// OtpChallenge rows keyed by `signupId`; a client-supplied flag would be the
// whole control. The object is non-strict, so a client that sends one anyway
// simply has it stripped before the service ever sees the payload.
export const RegisterRecruiterDto = z.object({
  email: z.string().email().toLowerCase(),
  password: passwordSchema,
  name: z.string().min(1).max(120),
  companyName: z.string().min(1).max(200),
  // Now mandatory: an account cannot be created without a verified mobile, so
  // there is no path that reaches here without one.
  phone: z.string().regex(PHONE_RE, 'Enter a valid mobile number'),
  // The handle minted by POST /auth/recruiter/otp/request. Possessing it is
  // what lets this call claim the verified EMAIL + PHONE pair.
  signupId: z.string().min(1).max(128),
});
export type RegisterRecruiterInput = z.infer<typeof RegisterRecruiterDto>;

// SRS §4.9.1 — request (or resend) a signup one-time code.
//
// The per-channel SHAPE of `destination` is deliberately NOT checked here. The
// service validates it, because killswitch.new_registrations has to answer
// first: during a signup freeze a malformed address must still be told "signups
// are closed", not "that email looks wrong".
export const RequestOtpDto = z
  .object({
    // Absent (or blank) on the first request of a signup attempt — the server
    // mints one and returns it — then echoed back on every later call. Its
    // value is opaque to the client, so nothing here validates its format:
    // what binds an EMAIL row to its PHONE row is that the handle is
    // unguessable, not that it matches a pattern.
    signupId: z.string().max(128).optional(),
    channel: z.enum(['EMAIL', 'PHONE']),
    destination: z.string().min(1).max(320),
    // The registrant's typed name, snapshotted for the sadmin "User name"
    // column — no User row exists yet to read it from.
    name: z.string().min(1).max(120),
  })
  .strict();
export type RequestOtpInput = z.infer<typeof RequestOtpDto>;

// SRS §4.9.1 — verify a signup one-time code.
export const VerifyOtpDto = z
  .object({
    signupId: z.string().min(1).max(128),
    channel: z.enum(['EMAIL', 'PHONE']),
    // Exactly six digits. Stays a string all the way to the timing-safe
    // comparison because a leading zero is significant ("012345").
    code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  })
  .strict();
export type VerifyOtpInput = z.infer<typeof VerifyOtpDto>;

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
