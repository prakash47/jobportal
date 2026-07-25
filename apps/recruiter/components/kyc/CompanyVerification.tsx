'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label, type BadgeVariant } from '@jobportal/ui';
import { api } from '../../lib/api-client';
import { KycDocumentUpload } from './KycDocumentUpload';
import { type KycBadgeStatus } from './KycStatusBadge';

export interface KycDocumentDto {
  id: number;
  docType: 'BUSINESS_REGISTRATION' | 'AUTHORIZED_PERSON_ID';
  originalFilename: string;
}

export interface KycInitial {
  status: KycBadgeStatus;
  legalName: string | null;
  gstNumber: string | null;
  panNumber: string | null;
  registrationNumber: string | null;
  authorizedPersonName: string | null;
  authorizedPersonDesignation: string | null;
  authorizedPersonIdType: string | null;
  rejectionReason: string | null;
  documents: KycDocumentDto[];
}

const ID_TYPE_OPTIONS = [
  { value: 'PAN', label: 'PAN card' },
  { value: 'AADHAAR', label: 'Aadhaar' },
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'VOTER_ID', label: 'Voter ID' },
  { value: 'DRIVING_LICENSE', label: 'Driving licence' },
];

// Lightweight client-side format hints (server is the source of truth).
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function CompanyVerification({ initial }: { initial: KycInitial }) {
  const router = useRouter();
  const status = initial.status;
  const locked = status === 'PENDING' || status === 'VERIFIED';

  const [legalName, setLegalName] = useState(initial.legalName ?? '');
  const [gstNumber, setGstNumber] = useState(initial.gstNumber ?? '');
  const [panNumber, setPanNumber] = useState(initial.panNumber ?? '');
  const [registrationNumber, setRegistrationNumber] = useState(initial.registrationNumber ?? '');
  const [personName, setPersonName] = useState(initial.authorizedPersonName ?? '');
  const [personDesignation, setPersonDesignation] = useState(initial.authorizedPersonDesignation ?? '');
  const [personIdType, setPersonIdType] = useState(initial.authorizedPersonIdType ?? '');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const bizDoc = initial.documents.find((d) => d.docType === 'BUSINESS_REGISTRATION') ?? null;
  const idDoc = initial.documents.find((d) => d.docType === 'AUTHORIZED_PERSON_ID') ?? null;

  const gstInvalid = gstNumber.trim() !== '' && !GSTIN_RE.test(gstNumber.trim().toUpperCase());
  const panInvalid = panNumber.trim() !== '' && !PAN_RE.test(panNumber.trim().toUpperCase());

  async function persist(): Promise<boolean> {
    const res = await api('/recruiter/kyc', {
      method: 'PUT',
      body: JSON.stringify({
        legalName,
        gstNumber,
        panNumber,
        registrationNumber,
        authorizedPersonName: personName,
        authorizedPersonDesignation: personDesignation,
        authorizedPersonIdType: personIdType,
      }),
    });
    if (!res.ok) {
      setError(res.message);
      return false;
    }
    return true;
  }

  async function saveDetails() {
    if (gstInvalid || panInvalid) {
      setError('Please fix the highlighted fields before saving.');
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    const ok = await persist();
    setBusy(false);
    if (ok) {
      setSaved(true);
      router.refresh();
    }
  }

  async function submit() {
    if (gstInvalid || panInvalid) {
      setError('Please fix the highlighted fields before submitting.');
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    const ok = await persist();
    if (!ok) {
      setBusy(false);
      return;
    }
    const res = await api('/recruiter/kyc/submit', { method: 'POST' });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <StatusBanner status={status} rejectionReason={initial.rejectionReason} />

      {/* Business details */}
      <section className="space-y-5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6">
        <header>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--color-fg)]">Business details</h2>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            The legal entity and tax identifiers we verify your company against.
          </p>
        </header>

        {locked ? (
          <ReadOnlyDetails initial={initial} />
        ) : (
          <div className="space-y-4">
            <Field label="Legal company name">
              <Input
                value={legalName}
                maxLength={200}
                placeholder="As registered (e.g. Acme Technologies Pvt Ltd)"
                onChange={(e) => setLegalName(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="GST number (GSTIN)" hint="15-character GSTIN" error={gstInvalid ? 'Invalid GSTIN format' : null}>
                <Input
                  value={gstNumber}
                  maxLength={15}
                  placeholder="e.g. 27AAACA1234A1Z5"
                  autoCapitalize="characters"
                  onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                />
              </Field>
              <Field label="Company PAN" hint="Optional · 10-character PAN" error={panInvalid ? 'Invalid PAN format' : null}>
                <Input
                  value={panNumber}
                  maxLength={10}
                  placeholder="e.g. AAACA1234A"
                  autoCapitalize="characters"
                  onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                />
              </Field>
            </div>
            <Field label="Registration / CIN number" hint="Optional · CIN, Udyam, or other registration number">
              <Input
                value={registrationNumber}
                maxLength={50}
                placeholder="e.g. U72900KA2015PTC123456"
                onChange={(e) => setRegistrationNumber(e.target.value)}
              />
            </Field>

            <fieldset className="space-y-4 border-t border-[var(--color-border)] pt-4">
              <legend className="text-sm font-medium text-[var(--color-fg)]">Authorized signatory</legend>
              <p className="-mt-1 text-xs text-[var(--color-fg-subtle)]">
                The person submitting this verification on the company&rsquo;s behalf.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Full name">
                  <Input value={personName} maxLength={120} onChange={(e) => setPersonName(e.target.value)} />
                </Field>
                <Field label="Designation">
                  <Input
                    value={personDesignation}
                    maxLength={120}
                    placeholder="e.g. Director"
                    onChange={(e) => setPersonDesignation(e.target.value)}
                  />
                </Field>
              </div>
              <Field label="ID proof type">
                <select
                  value={personIdType}
                  onChange={(e) => setPersonIdType(e.target.value)}
                  className="h-9 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-3 text-sm text-[var(--color-fg)]"
                >
                  <option value="">Select an ID type</option>
                  {ID_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            </fieldset>

            <div className="flex items-center gap-3 border-t border-[var(--color-border)] pt-4">
              <Button variant="secondary" onClick={saveDetails} loading={busy}>
                Save details
              </Button>
              {saved && !busy && (
                <span className="text-sm text-[var(--color-success)]" role="status">
                  Saved
                </span>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Documents */}
      <section className="space-y-4 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6">
        <header>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--color-fg)]">Documents</h2>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Upload clear scans or photos. PDF, PNG, JPG, or WebP · max 10&nbsp;MB each. Your documents are
            stored privately and only shared with our verification team.
          </p>
        </header>
        <KycDocumentUpload
          docType="BUSINESS_REGISTRATION"
          label="Business registration"
          description="Certificate of Incorporation, GST registration certificate, Udyam, or Shop &amp; Establishment licence."
          current={bizDoc ? { id: bizDoc.id, originalFilename: bizDoc.originalFilename } : null}
          locked={locked}
        />
        <KycDocumentUpload
          docType="AUTHORIZED_PERSON_ID"
          label="Authorized person ID proof"
          description="Government ID of the authorized signatory (PAN, Aadhaar, Passport, Voter ID, or Driving licence)."
          current={idDoc ? { id: idDoc.id, originalFilename: idDoc.originalFilename } : null}
          locked={locked}
        />
      </section>

      {/* Submit */}
      {!locked && (
        <section className="space-y-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6">
          <p className="text-sm text-[var(--color-fg-muted)]">
            When you&rsquo;ve added your business details and both documents, submit for review. Our team
            verifies most companies within 1&ndash;2 business days.
          </p>
          {error && (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}
          <Button variant="primary" onClick={submit} loading={busy}>
            {status === 'REJECTED' ? 'Resubmit for verification' : 'Submit for verification'}
          </Button>
        </section>
      )}

      {locked && error && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}

function StatusBanner({
  status,
  rejectionReason,
}: {
  status: KycBadgeStatus;
  rejectionReason: string | null;
}) {
  const config: Record<
    KycBadgeStatus,
    { variant: Exclude<BadgeVariant, 'primary' | 'neutral'> | 'neutral'; title: string; body: string }
  > = {
    NOT_SUBMITTED: {
      variant: 'neutral',
      title: 'Verify your company',
      body: 'Add your business details and documents below, then submit for review to earn a verified badge.',
    },
    PENDING: {
      variant: 'warning',
      title: 'Verification under review',
      body: 'Your documents have been submitted. We’ll update your status here once our team has reviewed them.',
    },
    VERIFIED: {
      variant: 'success',
      title: 'Your company is verified',
      body: 'Your company has been verified. A verified badge now appears across your recruiter account.',
    },
    REJECTED: {
      variant: 'danger',
      title: 'Action needed',
      body:
        rejectionReason && rejectionReason.trim().length > 0
          ? `Your verification was not approved: ${rejectionReason}`
          : 'Your verification was not approved. Please review your details and documents, then resubmit.',
    },
  };
  const c = config[status];
  const tone: Record<string, string> = {
    neutral: 'border-[var(--color-border)] bg-[var(--color-bg-elevated)]',
    warning: 'border-[oklch(0.85_0.08_80)] bg-[oklch(0.97_0.04_80)]',
    success: 'border-[oklch(0.85_0.08_145)] bg-[oklch(0.97_0.03_145)]',
    danger: 'border-[oklch(0.85_0.08_25)] bg-[oklch(0.97_0.03_25)]',
  };
  return (
    <div className={`rounded-md border p-4 ${tone[c.variant]}`}>
      <p className="text-sm font-semibold text-[var(--color-fg)]">{c.title}</p>
      <p className="mt-1 text-sm text-[var(--color-fg-muted)]">{c.body}</p>
    </div>
  );
}

function ReadOnlyDetails({ initial }: { initial: KycInitial }) {
  const rows: { label: string; value: string | null }[] = [
    { label: 'Legal company name', value: initial.legalName },
    { label: 'GST number (GSTIN)', value: initial.gstNumber },
    { label: 'Company PAN', value: initial.panNumber },
    { label: 'Registration / CIN', value: initial.registrationNumber },
    { label: 'Authorized signatory', value: initial.authorizedPersonName },
    { label: 'Designation', value: initial.authorizedPersonDesignation },
    { label: 'ID proof type', value: initial.authorizedPersonIdType },
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.label}>
          <dt className="text-xs text-[var(--color-fg-subtle)]">{r.label}</dt>
          <dd className="text-sm text-[var(--color-fg)]">{r.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-[var(--color-danger)]">{error}</p>
      ) : hint ? (
        <p className="text-xs text-[var(--color-fg-subtle)]">{hint}</p>
      ) : null}
    </div>
  );
}
