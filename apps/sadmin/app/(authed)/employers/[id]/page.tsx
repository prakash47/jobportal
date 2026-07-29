import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from '@jobportal/ui/icons';
import { formatDateIst, formatKycStatus } from '../../../../lib/jobs/format';
import {
  accountStateHint,
  deriveAccountState,
  displayName,
  formatAccountState,
  formatCompanyRole,
  formatCompanyType,
  type EmployerTeamMember,
} from '../../../../lib/employers/format';
import { getEmployerDetail, type EmployerDetail } from '../../../../lib/employers/queries';

export const metadata: Metadata = {
  title: 'Employer profile — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EmployerProfilePage({ params }: PageProps) {
  const { id } = await params;
  // The route is [id], so anything can arrive here. Reject non-numeric ids
  // before spending a query on them.
  //
  // ⚠ Both notFound() calls in this file depend on there being NO loading.tsx in
  // this segment or its parent: a Suspense boundary flushes the shell first, the
  // response commits 200, and the 404 silently becomes a soft 404. Measured —
  // see the note on the redirect in ../page.tsx.
  const companyId = Number(id);
  if (!Number.isInteger(companyId) || companyId < 1) notFound();

  // One anchor instant for the whole render, so the pending-invite window and
  // any date shown below cannot straddle a boundary and disagree.
  const now = new Date();
  const employer = await getEmployerDetail(companyId, now);
  if (!employer) notFound();

  const state = deriveAccountState(employer.team);
  const hint = accountStateHint(state);

  return (
    <div data-wide className="space-y-6">
      <BackLink />

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          {/* Recruiter-authored free text, rendered as plain text only. */}
          {employer.name}
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Registered {formatDateIst(employer.registeredAt)} · {formatAccountState(state)} ·{' '}
          {formatKycStatus(employer.kycStatus)}
        </p>
      </header>

      {hint && (
        <p
          role="status"
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-4 py-3 text-sm text-[var(--color-fg-muted)]"
        >
          {hint}
          {employer.activity.jobs.live > 0 && (
            <>
              {' '}
              It still has{' '}
              <strong className="font-medium text-[var(--color-fg)]">
                {employer.activity.jobs.live.toLocaleString('en-IN')} live{' '}
                {employer.activity.jobs.live === 1 ? 'job' : 'jobs'}
              </strong>{' '}
              on the platform.
            </>
          )}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card title="Recruiter team">
            <TeamTable team={employer.team} />
          </Card>

          {employer.description && (
            <Card title="About">
              {/* Company.description is recruiter-authored. Plain text, never
                  markup — untrusted content shown to staff. */}
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-fg)]">
                {employer.description}
              </p>
            </Card>
          )}
        </div>

        <aside className="space-y-6">
          <Card title="Company">
            <dl className="space-y-3 text-sm">
              <Row label="Industry" value={employer.industry ?? '—'} />
              <Row label="Headquarters" value={employer.headquartersCity ?? '—'} />
              <Row label="Type" value={formatCompanyType(employer.companyType) ?? '—'} />
              <Row label="Size" value={employer.employeeCount ?? '—'} />
              <Row
                label="Founded"
                value={employer.foundedYear == null ? '—' : String(employer.foundedYear)}
              />
              <Row
                label="Reviews"
                value={
                  employer.reviewCount === 0
                    ? 'None yet'
                    : `${employer.averageRating?.toFixed(1) ?? '—'} from ${employer.reviewCount.toLocaleString('en-IN')}`
                }
              />
              {employer.websiteUrl && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-[var(--color-fg-muted)]">Website</dt>
                  <dd className="min-w-0 text-right">
                    {/* Recruiter-supplied URL → nofollow. Own-product links (the
                        public profile below) deliberately do not carry it. */}
                    <a
                      href={employer.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex items-center gap-1 break-all text-[var(--color-primary-700)] hover:underline"
                    >
                      {employer.websiteUrl.replace(/^https?:\/\//, '')}
                      <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  </dd>
                </div>
              )}
            </dl>

            <a
              href={`${WEB_URL}/company/${employer.slug}-overview-${employer.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--color-primary-700)] hover:underline"
            >
              View public profile
              <ExternalLink className="size-3.5" aria-hidden="true" />
              <span className="sr-only">(opens the job seeker site in a new tab)</span>
            </a>
          </Card>

          <Card title="Business verification">
            <dl className="space-y-3 text-sm">
              <Row label="Status" value={formatKycStatus(employer.kycStatus)} />
              {employer.kyc && (
                <>
                  <Row label="Legal name" value={employer.kyc.legalName ?? '—'} />
                  <Row
                    label="Signatory"
                    value={
                      employer.kyc.authorizedPersonName
                        ? employer.kyc.authorizedPersonDesignation
                          ? `${employer.kyc.authorizedPersonName} (${employer.kyc.authorizedPersonDesignation})`
                          : employer.kyc.authorizedPersonName
                        : '—'
                    }
                  />
                  <Row label="Submitted" value={formatDateIst(employer.kyc.submittedAt)} />
                  <Row label="Reviewed" value={formatDateIst(employer.kyc.reviewedAt)} />
                </>
              )}
            </dl>
            {employer.kyc?.rejectionReason && (
              <p className="mt-3 text-sm text-[var(--color-fg-muted)]">
                Reason given: {employer.kyc.rejectionReason}
              </p>
            )}
            {/* GSTIN, PAN and the registration number are deliberately absent:
                they are PII under the DPDP Act, admin-kyc masks them even in its
                own list, and the verification review screen remains the one
                place they are handled. */}
            <p className="mt-3 text-xs text-[var(--color-fg-muted)]">
              Business identifiers and uploaded documents are handled in the verification review
              console.
            </p>
          </Card>

          <Card title="Activity">
            <dl className="space-y-3 text-sm">
              {/* Each bucket is named. A single "jobs posted" total would fold in
                  DRAFT rows that never reached a candidate — a bug this repo has
                  already shipped once. */}
              <Row label="Live jobs" value={fmt(employer.activity.jobs.live)} />
              <Row label="Awaiting review" value={fmt(employer.activity.jobs.awaitingReview)} />
              <Row label="Drafts" value={fmt(employer.activity.jobs.draft)} />
              <Row label="Expired" value={fmt(employer.activity.jobs.expired)} />
              <Row label="Closed" value={fmt(employer.activity.jobs.closed)} />
              <Row label="All postings" value={fmt(employer.activity.jobs.total)} />
              <Row label="Applications" value={fmt(employer.activity.applications)} />
              <Row label="Support tickets" value={fmt(employer.activity.supportTickets)} />
              <Row label="Pending invites" value={fmt(employer.activity.pendingInvites)} />
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString('en-IN');
}

function TeamTable({ team }: { team: EmployerDetail['team'] }) {
  if (team.length === 0) {
    return (
      <p className="text-sm text-[var(--color-fg-muted)]">
        No recruiter has ever registered for this company, so nobody can sign in to manage it.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-left text-sm">
        <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">
              Name
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Role
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Phone
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Joined
            </th>
            <th scope="col" className="py-2 font-medium">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {team.map((m) => (
            <TeamRow key={m.id} member={m} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamRow({ member }: { member: EmployerTeamMember }) {
  const removed = member.deactivatedAt !== null;
  return (
    <tr>
      <td className="py-3 pr-4">
        <span className="block font-medium text-[var(--color-fg)]">{displayName(member)}</span>
        <span className="mt-0.5 block text-xs text-[var(--color-fg-muted)]">{member.email}</span>
      </td>
      <td className="py-3 pr-4 text-[var(--color-fg-muted)]">
        <span className="block">{formatCompanyRole(member.companyRole)}</span>
        {member.designation && (
          <span className="mt-0.5 block text-xs">{member.designation}</span>
        )}
      </td>
      <td className="py-3 pr-4 text-[var(--color-fg-muted)]">{member.contactPhone ?? '—'}</td>
      <td className="py-3 pr-4 text-[var(--color-fg-muted)]">{formatDateIst(member.joinedAt)}</td>
      <td className="py-3">
        {removed ? (
          <span className="block">
            <span className="font-medium text-[var(--color-danger)]">Removed</span>
            <span className="mt-0.5 block text-xs text-[var(--color-fg-muted)]">
              {formatDateIst(member.deactivatedAt)}
            </span>
          </span>
        ) : (
          <span className="text-[var(--color-fg)]">Active</span>
        )}
      </td>
    </tr>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
      <h2 className="text-sm font-semibold text-[var(--color-fg)]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[var(--color-fg-muted)]">{label}</dt>
      <dd className="min-w-0 text-right text-[var(--color-fg)]">{value}</dd>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/employers"
      className="inline-flex items-center gap-1.5 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Back to employer management
    </Link>
  );
}
