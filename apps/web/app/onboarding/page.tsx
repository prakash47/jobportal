import type { Metadata } from 'next';
import { prisma } from '@jobportal/db';
import { requireUser } from '../../lib/auth/require-user';
import { OnboardingForm } from './OnboardingForm';

// Authed, dynamic, noindex (like the other private routes).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Welcome — Career Queue',
  robots: { index: false, follow: false },
};

// Post-Google-signup step: confirm your display name (prefilled from Google,
// editable) — the email is fixed. The Google callback sends brand-new accounts
// here; any signed-in user can also reach it (it's just a name-confirm screen).
export default async function OnboardingPage() {
  const claims = await requireUser();
  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { name: true, email: true },
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
      <div className="w-full">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">You&apos;re almost in</h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Confirm how your name should appear. You can change it anytime in your profile.
        </p>

        <div className="mt-8">
          <OnboardingForm initialName={user?.name ?? ''} email={user?.email ?? claims.email} />
        </div>
      </div>
    </main>
  );
}
