import { prisma } from '@jobportal/db';
import { Button } from '@jobportal/ui';
import { readUserFromCookie } from '../../../lib/auth/server-session';
import { VerifyWorkEmailBanner } from '../../../components/VerifyWorkEmailBanner';

// Empty-state dashboard. The 'Post a job' button is intentionally disabled
// until Task 17 wires the wizard — we want recruiters to see the path even
// when they can't take it yet.

export default async function DashboardPage() {
  const session = (await readUserFromCookie())!;
  const recruiter = await prisma.recruiter.findUnique({
    where: { userId: session.sub },
    select: { workEmail: true, workEmailVerified: true },
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">Dashboard</h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Post jobs, manage applicants, and track activity.
        </p>
      </header>

      {recruiter && !recruiter.workEmailVerified && (
        <VerifyWorkEmailBanner workEmail={recruiter.workEmail} />
      )}

      <div className="rounded-md border border-dashed border-[var(--color-border)] p-10 text-center">
        <p className="text-sm font-medium text-[var(--color-fg)]">No jobs posted yet</p>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Post your first opening and start receiving applicants.
        </p>
        <Button
          variant="primary"
          disabled
          className="mt-4"
          title="Job posting wizard arrives in the next release"
        >
          Post a job
        </Button>
      </div>
    </div>
  );
}
