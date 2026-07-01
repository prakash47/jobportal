import { notFound } from 'next/navigation';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { requireRecruiter } from '../../../../lib/auth/require-recruiter';
import { ChangePasswordForm } from '../../../../components/settings/ChangePasswordForm';

// Recruiter "Change password" (Settings → Change password). The form POSTs to
// the BFF, which is the trusted boundary (L3): it verifies the current password,
// sets the new one, and rotates sessions. L2 of the killswitch lives here — if
// an admin flips killswitch.recruiter_change_password ON the page 404s.

export const dynamic = 'force-dynamic';

export default async function ChangePasswordPage() {
  if (await isFlagEnabled('killswitch.recruiter_change_password')) notFound();

  // Belt-and-suspenders role gate (the (authed) layout already ran it); also
  // keeps the page dynamic + authenticated in isolation.
  await requireRecruiter();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          Change password
        </h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Update the password you use to sign in to the recruiter portal. For your security,
          changing it signs you out on every other device.
        </p>
      </header>

      <ChangePasswordForm />
    </div>
  );
}
