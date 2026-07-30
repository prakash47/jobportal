import { redirect } from 'next/navigation';

// The link-based reset was retired when the flow moved to a 6-digit OTP
// (SRS §4.12.5): the whole reset now happens on /forgot-password, and the
// migration that shipped with it deleted every outstanding link token, so a
// `?token=` in the wild can no longer be redeemed by anything.
//
// Kept as a permanent redirect rather than deleted so an old bookmark, or a
// reset email still sitting in someone's inbox, lands on the live flow instead
// of a 404. The token in the query string is simply dropped.
export const dynamic = 'force-static';

export default function ResetPasswordPage(): never {
  redirect('/forgot-password');
}
