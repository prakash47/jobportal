// The password rule, mirrored for the client so the form can show what is
// actually required instead of a strength score it would be guessing at.
//
// These three predicates ARE the whole server rule — PASSWORD_RE in
// packages/auth/src/password.ts is
//   /^(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]).{8,}$/
// i.e. 8+ characters, one digit, one special character. No uppercase, no
// lowercase, no letter at all. If that regex changes, change these together —
// the server stays the authority, and this list only exists so the user is told
// the truth up front rather than after a round trip.

export const PASSWORD_SPECIAL_RE = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/;

export interface PasswordRule {
  id: string;
  label: string;
  met: (value: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: 'length', label: '8 characters or more', met: (v) => v.length >= 8 },
  { id: 'digit', label: 'Contains a number', met: (v) => /\d/.test(v) },
  {
    id: 'special',
    label: 'Contains a special character (! @ # $ …)',
    met: (v) => PASSWORD_SPECIAL_RE.test(v),
  },
];

export function meetsPasswordRules(value: string): boolean {
  return PASSWORD_RULES.every((r) => r.met(value));
}

/**
 * Mask an email for display: first and last character of the local part, the
 * middle as bullets, and the DOMAIN IN FULL — the domain is how someone spots
 * they typed `gmial.com`, which is exactly the mistake this screen has to help
 * them catch. Bullets are capped so a long local part cannot blow the row.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local[0] ?? ''}•${domain}`;
  const bullets = '•'.repeat(Math.min(8, local.length - 2));
  return `${local[0]}${bullets}${local[local.length - 1]}${domain}`;
}

/**
 * Pull a 6-digit code out of pasted text. Prefers the LAST run of exactly six
 * consecutive digits, because stripping every non-digit turns
 * "Career Queue 2026 — your code is 483920" into "2026483920" → "202648", a
 * wrong code that costs one of five attempts.
 */
export function extractOtp(raw: string): string {
  const runs = raw.match(/(?<!\d)\d{6}(?!\d)/g);
  if (runs && runs.length > 0) return runs[runs.length - 1]!;
  return raw.replace(/\D/g, '').slice(0, 6);
}
