import Link from 'next/link';
import { prisma } from '@jobportal/db';
import { Button } from '@jobportal/ui';
import { readUserFromCookie } from '../../../lib/auth/server-session';
import { VerifyWorkEmailBanner } from '../../../components/VerifyWorkEmailBanner';

// Empty-state dashboard. The 'Post a job' button links to the dedicated
// /post-job page (the posting flow now lives there — moved out of /jobs/new).
// Company identity (logo + name + KYC status) lives in the shared (authed)
// top bar, so it shows on every page.

export default async function DashboardPage() {
  const session = (await readUserFromCookie())!;
  const recruiter = await prisma.recruiter.findUnique({
    where: { userId: session.sub },
    select: {
      workEmailVerified: true,
      user: { select: { email: true } },
    },
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Post jobs, manage applicants, and track activity.
        </p>
      </header>

      {recruiter && !recruiter.workEmailVerified && (
        <VerifyWorkEmailBanner email={recruiter.user.email} />
      )}

      <div className="rounded-md border border-dashed border-[var(--color-border)] p-10 text-center">
        <p className="text-sm font-medium text-[var(--color-fg)]">No jobs posted yet</p>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Post your first opening and start receiving applicants.
        </p>
        <Button asChild variant="primary" className="mt-4">
          <Link href="/post-job">Post a job</Link>
        </Button>
      </div>
    </div>
  );
}
