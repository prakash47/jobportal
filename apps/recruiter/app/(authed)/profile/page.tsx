import Link from 'next/link';
import { prisma } from '@jobportal/db';
import { readUserFromCookie } from '../../../lib/auth/server-session';
import { EditableProfile } from '../../../components/profile/EditableProfile';
import { KycStatusBadge } from '../../../components/kyc/KycStatusBadge';

// Editable recruiter profile (SRS §4.9.1). Reads run here in the RSC via Prisma
// (reads/writes split — only mutations hit the BFF); the EditableProfile client
// component PATCHes /recruiter/profile + /recruiter/company and uploads the logo.

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const session = (await readUserFromCookie())!;

  const [recruiter, industries, cities] = await Promise.all([
    prisma.recruiter.findUnique({
      where: { userId: session.sub },
      select: {
        designation: true,
        department: true,
        contactPhone: true,
        altPocName: true,
        altPocEmail: true,
        altPocPhone: true,
        workEmailVerified: true,
        user: { select: { name: true, email: true, emailVerified: true } },
        company: {
          select: {
            id: true,
            name: true,
            description: true,
            logoUrl: true,
            websiteUrl: true,
            companyType: true,
            industryId: true,
            headquartersCityId: true,
            employeeCount: true,
            foundedYear: true,
            kyc: { select: { status: true } },
          },
        },
      },
    }),
    prisma.industry.findMany({ select: { id: true, slug: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.city.findMany({ select: { id: true, slug: true, name: true }, orderBy: { name: 'asc' } }),
  ]);

  if (!recruiter) {
    return (
      <div className="rounded-md border border-dashed border-[var(--color-border)] p-10 text-center text-sm text-[var(--color-fg-muted)]">
        Recruiter profile not found. If you just registered, please reload.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">Profile</h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Keep your details and company information up to date.
          </p>
        </div>
        <Link
          href="/kyc"
          className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)]"
        >
          <span>Company verification</span>
          <KycStatusBadge status={recruiter.company.kyc?.status ?? 'NOT_SUBMITTED'} />
        </Link>
      </header>

      <EditableProfile
        user={recruiter.user}
        recruiter={{
          designation: recruiter.designation,
          department: recruiter.department,
          contactPhone: recruiter.contactPhone,
          altPocName: recruiter.altPocName,
          altPocEmail: recruiter.altPocEmail,
          altPocPhone: recruiter.altPocPhone,
          workEmailVerified: recruiter.workEmailVerified,
        }}
        company={recruiter.company}
        industries={industries}
        cities={cities}
      />
    </div>
  );
}
