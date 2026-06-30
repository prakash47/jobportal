import { prisma } from '@jobportal/db';
import { Button } from '@jobportal/ui';
import { readUserFromCookie } from '../../../lib/auth/server-session';
import { VerifyWorkEmailBanner } from '../../../components/VerifyWorkEmailBanner';
import { CompanyLogo } from '../../../components/CompanyLogo';
import { KycStatusBadge } from '../../../components/kyc/KycStatusBadge';

// Empty-state dashboard. The 'Post a job' button is intentionally disabled
// until Task 17 wires the wizard — we want recruiters to see the path even
// when they can't take it yet.

export default async function DashboardPage() {
  const session = (await readUserFromCookie())!;
  const recruiter = await prisma.recruiter.findUnique({
    where: { userId: session.sub },
    select: {
      workEmailVerified: true,
      user: { select: { email: true } },
      company: {
        select: { id: true, name: true, logoUrl: true, kyc: { select: { status: true } } },
      },
    },
  });

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        {recruiter && (
          // Logo before the company name (SRS §4.9.1) — set it on the Profile tab.
          <div className="flex items-center gap-3">
            <CompanyLogo
              companyId={recruiter.company.id}
              name={recruiter.company.name}
              logoUrl={recruiter.company.logoUrl}
              size={40}
            />
            <span className="text-base font-medium text-[var(--color-fg)]">
              {recruiter.company.name}
            </span>
            <KycStatusBadge status={recruiter.company.kyc?.status ?? 'NOT_SUBMITTED'} />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Post jobs, manage applicants, and track activity.
          </p>
        </div>
      </header>

      {recruiter && !recruiter.workEmailVerified && (
        <VerifyWorkEmailBanner email={recruiter.user.email} />
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
