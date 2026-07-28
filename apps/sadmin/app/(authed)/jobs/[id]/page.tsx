import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from '@jobportal/ui/icons';
import { adminApiGet } from '../../../../lib/admin-api';
import {
  formatDateIst,
  formatDateTimeIst,
  formatEmploymentType,
  formatExperience,
  formatKycStatus,
  formatSalaryLpa,
  formatWaiting,
  formatWorkMode,
  waitingDays,
} from '../../../../lib/jobs/format';
import type { JobReviewDetail } from '../../../../lib/jobs/types';
import { JobDecisionForm } from '../../../../components/jobs/JobDecisionForm';

export const metadata: Metadata = {
  title: 'Job review — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function JobReviewDetailPage({ params }: PageProps) {
  const { id } = await params;
  // The route is [id], so anything can arrive here. Reject non-numeric ids
  // before spending an API call on them.
  const jobId = Number(id);
  if (!Number.isInteger(jobId) || jobId < 1) notFound();

  const result = await adminApiGet<JobReviewDetail>(`/admin/jobs/${jobId}`);
  if (!result.ok) {
    if (result.status === 404) notFound();
    return (
      <div data-wide className="space-y-6">
        <BackLink />
        <p
          role="alert"
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 text-sm text-[var(--color-danger)]"
        >
          {result.message}
        </p>
      </div>
    );
  }

  const job = result.data;
  const awaiting = job.status === 'PENDING_MODERATION';
  const salary = formatSalaryLpa(job.salaryMinPaise, job.salaryMaxPaise);
  const experience = formatExperience(job.experienceMinYears, job.experienceMaxYears);

  return (
    <div data-wide className="space-y-6">
      <BackLink />

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          {job.title}
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          {job.company?.name ?? 'Unknown company'}
          {job.primaryCity ? ` · ${job.primaryCity.name}` : ''}
          {job.locality ? ` (${job.locality.name})` : ''}
        </p>
      </header>

      <StatusBanner job={job} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card title="Job description">
            {/* Deliberately rendered as PLAIN TEXT, never as HTML or Markdown.
                This is recruiter-authored content being shown to staff for the
                express purpose of judging it, so it must not be able to inject
                markup into the console that reviews it. `description` is the
                always-present plain column; descriptionMarkdown is the richer
                copy and is shown the same way. */}
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-fg)]">
              {job.descriptionMarkdown ?? job.description}
            </p>
          </Card>

          {job.qualifications && (
            <Card title="Qualifications">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-fg)]">
                {job.qualifications}
              </p>
            </Card>
          )}

          {job.skills.length > 0 && (
            <Card title="Skills">
              <ul className="flex flex-wrap gap-2">
                {job.skills.map((s) => (
                  <li
                    key={s}
                    className="rounded-md bg-[var(--color-bg-muted)] px-2 py-1 text-xs text-[var(--color-fg)]"
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {awaiting && <JobDecisionForm jobId={job.id} />}
        </div>

        <aside className="space-y-6">
          <Card title="Posting">
            <dl className="space-y-3 text-sm">
              <Row label="Status" value={statusLabel(job.status)} />
              <Row label="Employment" value={formatEmploymentType(job.employmentType)} />
              <Row label="Work mode" value={formatWorkMode(job.workMode)} />
              <Row label="Openings" value={job.openings == null ? '—' : String(job.openings)} />
              {/* The Job model has no "confidential" flag, so an absent band
                  means undisclosed rather than hidden. */}
              <Row label="Salary" value={salary ?? 'Not disclosed'} />
              <Row label="Experience" value={experience ?? 'Not specified'} />
              <Row label="Expires" value={formatDateIst(job.expiresAt)} />
            </dl>
          </Card>

          <Card title="Employer">
            <dl className="space-y-3 text-sm">
              <Row label="Company" value={job.company?.name ?? '—'} />
              {/* The single most useful signal a moderator has: whether this
                  employer has passed business verification. */}
              <Row label="Verification" value={formatKycStatus(job.companyKycStatus)} />
              <Row
                label="Posted by"
                value={
                  job.postedBy?.name ?? job.postedBy?.email ?? 'No longer at the company'
                }
              />
              {job.postedBy?.email && <Row label="Contact" value={job.postedBy.email} />}
              {job.company?.websiteUrl && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-[var(--color-fg-muted)]">Website</dt>
                  <dd className="min-w-0 text-right">
                    <a
                      href={job.company.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex items-center gap-1 break-all text-[var(--color-primary-700)] hover:underline"
                    >
                      {job.company.websiteUrl.replace(/^https?:\/\//, '')}
                      <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          <Card title="Review">
            <dl className="space-y-3 text-sm">
              <Row label="Submitted" value={formatDateTimeIst(job.submittedForReviewAt)} />
              {awaiting ? (
                <Row
                  label="Waiting"
                  value={formatWaiting(waitingDays(job.submittedForReviewAt, new Date()))}
                />
              ) : (
                <Row label="Decided" value={formatDateTimeIst(job.reviewedAt)} />
              )}
            </dl>
            {/* The public page 404s a job that has not been approved for
                everyone except its owner, collaborators and admins — this
                account is an admin, so the link works and shows exactly what a
                candidate would eventually see. */}
            <a
              href={`${WEB_URL}/job/${job.canonicalSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--color-primary-700)] hover:underline"
            >
              Preview the public page
              <ExternalLink className="size-3.5" aria-hidden="true" />
              <span className="sr-only">(opens the job seeker site in a new tab)</span>
            </a>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function StatusBanner({ job }: { job: JobReviewDetail }) {
  if (job.status === 'PENDING_MODERATION') return null;

  // A decided job. rejectionReason is nulled on approve and set on send-back,
  // so its presence is the outcome — one source of truth, no separate verdict
  // column to drift.
  const sentBack = job.rejectionReason != null;
  return (
    <div
      role="status"
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-4 py-3 text-sm"
    >
      <p className="font-medium text-[var(--color-fg)]">
        {sentBack
          ? 'This job was sent back to the recruiter.'
          : job.reviewedAt
            ? 'This job was approved and is no longer awaiting review.'
            : 'This job is not awaiting review.'}
      </p>
      {sentBack && (
        <p className="mt-1 text-[var(--color-fg-muted)]">Reason given: {job.rejectionReason}</p>
      )}
      {!sentBack && !job.reviewedAt && (
        <p className="mt-1 text-[var(--color-fg-muted)]">
          It is currently {statusLabel(job.status).toLowerCase()}, so there is nothing to decide.
        </p>
      )}
    </div>
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
      href="/jobs"
      className="inline-flex items-center gap-1.5 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Back to job review
    </Link>
  );
}

// "Open" is the label the recruiter portal gives JobStatus.ACTIVE, so the two
// consoles describe the same job the same way.
const STATUS_LABEL: Record<string, string> = {
  PENDING_MODERATION: 'Awaiting review',
  ACTIVE: 'Open',
  DRAFT: 'Draft',
  EXPIRED: 'Expired',
  CLOSED: 'Closed',
};

function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}
