import Link from 'next/link';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@jobportal/auth';
import { KycStatusPill, type AdminKycStatus } from '../../../../components/admin/KycStatusPill';
import { KycReviewActions } from '../../../../components/admin/KycReviewActions';

export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface KycReviewDocument {
  id: number;
  docType: 'BUSINESS_REGISTRATION' | 'AUTHORIZED_PERSON_ID';
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  scanStatus: string;
  uploadedAt: string;
  downloadUrl: string;
}

interface KycReviewDetail {
  company: { id: number; name: string; slug: string; logoUrl: string | null; websiteUrl: string | null };
  status: AdminKycStatus;
  legalName: string | null;
  gstNumber: string | null;
  panNumber: string | null;
  registrationNumber: string | null;
  authorizedPersonName: string | null;
  authorizedPersonDesignation: string | null;
  authorizedPersonIdType: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedById: number | null;
  rejectionReason: string | null;
  documents: KycReviewDocument[];
  downloadUrlTtlSeconds: number;
}

const DOC_LABEL: Record<KycReviewDocument['docType'], string> = {
  BUSINESS_REGISTRATION: 'Business registration',
  AUTHORIZED_PERSON_ID: 'Authorized person ID',
};

interface PageProps {
  params: Promise<{ companyId: string }>;
}

async function fetchDetail(companyId: string): Promise<KycReviewDetail | null> {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  const res = await fetch(`${API_URL}/admin/kyc/${companyId}`, {
    headers: { cookie: `${ACCESS_COOKIE}=${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as KycReviewDetail;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function KycReviewDetailPage({ params }: PageProps) {
  const { companyId } = await params;
  const data = await fetchDetail(companyId);

  if (!data) {
    return (
      <div className="space-y-4">
        <Link href="/admin/kyc-review" className="text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
          ← Back to queue
        </Link>
        <p className="text-sm text-[var(--color-fg-muted)]">
          No verification record found for this company.
        </p>
      </div>
    );
  }

  const identifiers: { label: string; value: string | null; mono?: boolean }[] = [
    { label: 'Legal company name', value: data.legalName },
    { label: 'GST number (GSTIN)', value: data.gstNumber, mono: true },
    { label: 'Company PAN', value: data.panNumber, mono: true },
    { label: 'Registration / CIN', value: data.registrationNumber, mono: true },
    { label: 'Authorized signatory', value: data.authorizedPersonName },
    { label: 'Designation', value: data.authorizedPersonDesignation },
    { label: 'ID proof type', value: data.authorizedPersonIdType },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/kyc-review" className="text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
          ← Back to queue
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            {data.company.name}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Submitted {formatDate(data.submittedAt)}
            {data.reviewedAt ? ` · reviewed ${formatDate(data.reviewedAt)}` : ''}
          </p>
        </div>
        <KycStatusPill status={data.status} />
      </header>

      {data.status === 'REJECTED' && data.rejectionReason && (
        <div className="rounded-md border border-[oklch(0.85_0.08_25)] bg-[oklch(0.97_0.03_25)] p-4">
          <p className="text-sm font-medium text-[var(--color-fg)]">Rejection reason</p>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">{data.rejectionReason}</p>
        </div>
      )}

      <section className="space-y-4 rounded-md border border-[var(--color-border)] p-6">
        <h2 className="text-sm font-semibold text-[var(--color-fg)]">Business details</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {identifiers.map((row) => (
            <div key={row.label}>
              <dt className="text-xs text-[var(--color-fg-subtle)]">{row.label}</dt>
              <dd className={row.mono ? 'font-mono text-sm text-[var(--color-fg)]' : 'text-sm text-[var(--color-fg)]'}>
                {row.value ?? '—'}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-3 rounded-md border border-[var(--color-border)] p-6">
        <h2 className="text-sm font-semibold text-[var(--color-fg)]">Documents</h2>
        {data.documents.length === 0 ? (
          <p className="text-sm text-[var(--color-fg-muted)]">No documents uploaded.</p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {data.documents.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--color-fg)]">{DOC_LABEL[doc.docType]}</p>
                  <p className="truncate text-xs text-[var(--color-fg-subtle)]" title={doc.originalFilename}>
                    {doc.originalFilename}
                  </p>
                </div>
                {/* Signed, short-lived URL (expires in ~15 min) generated server-side. */}
                <a
                  href={doc.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-sm text-[var(--color-fg)] hover:text-[var(--color-primary-600)] hover:underline"
                >
                  View document
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.status === 'PENDING' ? (
        <KycReviewActions companyId={data.company.id} />
      ) : data.status === 'VERIFIED' || data.status === 'REJECTED' ? (
        <p className="text-sm text-[var(--color-fg-muted)]">
          This submission has already been {data.status === 'VERIFIED' ? 'approved' : 'rejected'}.
        </p>
      ) : null}
    </div>
  );
}
