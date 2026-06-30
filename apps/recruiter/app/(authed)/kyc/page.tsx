import { notFound } from 'next/navigation';
import { prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { readUserFromCookie } from '../../../lib/auth/server-session';
import { CompanyVerification, type KycInitial } from '../../../components/kyc/CompanyVerification';
import { KycStatusBadge } from '../../../components/kyc/KycStatusBadge';

// Recruiter "Company Verification" (KYC). Reads run here in the RSC via Prisma
// (reads/writes split); the CompanyVerification client component PUTs identifiers
// and POSTs documents/submit to the BFF. L2 of the killswitch lives here — if the
// admin flips killswitch.recruiter_kyc ON the page 404s (L3 in the API is the
// trusted, non-bypassable layer).

export const dynamic = 'force-dynamic';

export default async function KycPage() {
  if (await isFlagEnabled('killswitch.recruiter_kyc')) notFound();

  const session = (await readUserFromCookie())!;
  const recruiter = await prisma.recruiter.findUnique({
    where: { userId: session.sub },
    select: { companyId: true },
  });

  if (!recruiter) {
    return (
      <div className="rounded-md border border-dashed border-[var(--color-border)] p-10 text-center text-sm text-[var(--color-fg-muted)]">
        Recruiter profile not found. If you just registered, please reload.
      </div>
    );
  }

  const kyc = await prisma.companyKyc.findUnique({
    where: { companyId: recruiter.companyId },
    include: {
      documents: {
        where: { deletedAt: null },
        orderBy: [{ docType: 'asc' }, { uploadedAt: 'desc' }],
      },
    },
  });

  const initial: KycInitial = {
    status: kyc?.status ?? 'NOT_SUBMITTED',
    legalName: kyc?.legalName ?? null,
    gstNumber: kyc?.gstNumber ?? null,
    panNumber: kyc?.panNumber ?? null,
    registrationNumber: kyc?.registrationNumber ?? null,
    authorizedPersonName: kyc?.authorizedPersonName ?? null,
    authorizedPersonDesignation: kyc?.authorizedPersonDesignation ?? null,
    authorizedPersonIdType: kyc?.authorizedPersonIdType ?? null,
    rejectionReason: kyc?.rejectionReason ?? null,
    documents: (kyc?.documents ?? []).map((d) => ({
      id: d.id,
      docType: d.docType,
      originalFilename: d.originalFilename,
    })),
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            Company verification
          </h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Verify your company (KYC) to earn a verified badge and build candidate trust.
          </p>
        </div>
        <KycStatusBadge status={initial.status} />
      </header>

      <CompanyVerification initial={initial} />
    </div>
  );
}
