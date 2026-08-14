import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft, ExternalLink } from '@jobportal/ui/icons';
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
} from '../../lib/jobs/format';
import type { JobReviewDetail } from '../../lib/jobs/types';

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

/**
 * Everything a super admin can see about one posting, shared by the two routes
 * that show a job:
 *
 *   - /sadmin/jobs/[id]        — the moderation screen. Passes
 *                                `decisionForm` so the approve/send-back form
 *                                renders, and backs out to the review queue.
 *   - /sadmin/job-postings/[id] — the master-list detail. Passes `actions`
 *                                (Delete) instead, and backs out to the exact
 *                                filtered list page the admin came from.
 *
 * Extracted from the moderation page rather than written fresh, so the two
 * screens cannot drift into describing the same job differently. The extraction
 * is presentational only — the moderation route keeps its own id coercion, its
 * own adminApiGet call and its own error branch, so its behaviour is unchanged.
 *
 * `now` is a prop rather than a `new Date()` in here, so the whole render shares
 * one anchor instant and the caller decides it — the discipline every lib/*
 * module in this app already follows.
 */
export function JobDetailView({
  job,
  backHref,
  backLabel,
  now,
  decisionForm,
  actions,
}: {
  job: JobReviewDetail;
  backHref: string;
  backLabel: string;
  now: Date;
  /** The moderation approve/send-back form. Omitted on the master-list route. */
  decisionForm?: ReactNode;
  /** Row actions (Delete). Omitted on the moderation route. */
  actions?: ReactNode;
}) {
  const awaiting = job.status === 'PENDING_MODERATION';
  const salary = formatSalaryLpa(job.salaryMinPaise, job.salaryMaxPaise);
  const experience = formatExperience(job.experienceMinYears, job.experienceMaxYears);

  return (
    <div data-wide className="space-y-6">
      <BackLink href={backHref} label={backLabel} />

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            {job.title}
          </h1>
          <p className="text-sm text-[var(--color-fg-muted)]">
            {job.company?.name ?? 'Unknown company'}
            {job.primaryCity ? ` · ${job.primaryCity.name}` : ''}
            {job.locality ? ` (${job.locality.name})` : ''}
          </p>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-3 text-sm">{actions}</div>}
      </header>

      <StatusBanner job={job} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {/* The one-line summary the seeker sees in search results. Fetched by
              the API all along but never rendered — so a reviewer judging the
              posting could not see the line that actually sells it. */}
          {job.shortDescription && (
            <Card title="Short description">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-fg)]">
                {job.shortDescription}
              </p>
            </Card>
          )}

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

          {/* cityIds resolved to names by the API. A multi-city posting shows
              only its primaryCity in the header, so without this the other
              locations are invisible. */}
          {job.cities.length > 0 && (
            <Card title="All locations">
              <ul className="flex flex-wrap gap-2">
                {job.cities.map((c) => (
                  <li
                    key={c}
                    className="rounded-md bg-[var(--color-bg-muted)] px-2 py-1 text-xs text-[var(--color-fg)]"
                  >
                    {c}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {decisionForm}
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
              {/* postedAt means "reached the market", stamped on approval — so
                  it is genuinely absent for a draft or a job still in review,
                  and formatDateIst renders the em dash for that. */}
              <Row label="Posted" value={formatDateIst(job.postedAt)} />
              <Row label="Expires" value={formatDateIst(job.expiresAt)} />
            </dl>
          </Card>

          {/* Classification the API already resolves to names. Rendered as its
              own card rather than crammed into Posting so an absent industry or
              functional area is visibly absent rather than merely missing. */}
          <Card title="Classification">
            <dl className="space-y-3 text-sm">
              <Row label="Industry" value={job.industry?.name ?? '—'} />
              <Row label="Function" value={job.functionalArea?.name ?? '—'} />
              <Row label="Job type" value={job.jobType} />
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
                value={job.postedBy?.name ?? job.postedBy?.email ?? 'No longer at the company'}
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
                <Row label="Waiting" value={formatWaiting(waitingDays(job.submittedForReviewAt, now))} />
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

export function Card({ title, children }: { title: string; children: ReactNode }) {
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

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {label}
    </Link>
  );
}

// "Open" is the label the recruiter portal gives JobStatus.ACTIVE, so the two
// consoles describe the same job the same way.
//
// ⚠ Deliberately NOT switched to the Job Postings console's own map
// (JOB_POSTING_STATUS_LABEL says "Active"). This banner is shared with the
// shipped moderation screen, and retitling a live surface is a separate,
// reviewable change — a consolidation follow-up is logged in PROGRESS.md.
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
