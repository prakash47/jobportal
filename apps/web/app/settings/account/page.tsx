import type { Metadata } from 'next';
import { prisma } from '@jobportal/db';
import { requireUser } from '../../../lib/auth/require-user';
import { PageHeader } from '../../../components/dashboard/PageHeader';
import { ContentCard } from '../../../components/dashboard/ContentCard';
import { DeleteAccountCard } from '../../../components/settings/DeleteAccountCard';

// Private surface; never indexed (CLAUDE.md §6 lists /settings/* as noindex).
export const metadata: Metadata = {
  title: 'Account',
  robots: { index: false, follow: false },
};

/**
 * Account settings — currently the home for deletion.
 *
 * Its own page rather than a section bolted onto Notifications: an irreversible
 * action sitting under a list of email toggles is one mis-scroll from a mis-click,
 * and it needs room to say what deletion actually removes.
 */
export default async function AccountSettingsPage() {
  const session = await requireUser();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.sub },
    select: { email: true },
  });

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Account"
        description="Your sign-in details and the controls that affect the whole account."
      />

      <ContentCard className="p-5 sm:p-6">
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-[var(--color-fg)]">Signed in as</p>
          <p className="text-sm text-[var(--color-fg-muted)]">{user.email}</p>
          <p className="pt-1 text-xs text-[var(--color-fg-subtle)]">
            To change your email or password, use{' '}
            <span className="text-[var(--color-fg-muted)]">Personal details</span> and the password
            reset flow respectively.
          </p>
        </div>
      </ContentCard>

      <DeleteAccountCard email={user.email} />
    </div>
  );
}
