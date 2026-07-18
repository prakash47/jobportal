import type { ReactNode } from 'react';
import { Briefcase, Clock, MapPin, Users } from '@jobportal/ui/icons';
import { CompanyLogo } from '../../CompanyLogo';
import { JobStatusBadge, type JobStatus } from '../JobStatusBadge';
import { EMPLOYMENT_LABELS, formatListDate, type EmploymentType } from '../job-list-format';
import { JobQuickActions } from './JobQuickActions';

export interface JobDetailHeaderProps {
  jobId: number;
  title: string;
  companyId: number;
  companyName: string;
  logoUrl: string | null;
  status: JobStatus;
  /** Pre-formatted "place · mode" location (formatJobLocation) — already encodes
   * the work mode ("Bangalore · Hybrid" / "Remote"), so no separate mode chip. */
  location: string;
  employmentType: EmploymentType;
  openings: number | null;
  postedAt: Date;
  /** Absolute seeker-site URL for the public posting (View public page / Preview). */
  publicUrl: string;
}

function Chip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="shrink-0 text-[var(--color-fg-muted)]" aria-hidden="true">
        {icon}
      </span>
      {children}
    </span>
  );
}

// §1 Overview header — the critical facts a recruiter needs at a glance
// (title, company, location, job type, openings, posted date, status) plus the
// primary actions, all above the fold. Mirrors the seeker JobHero layout with
// recruiter theme tokens.
export function JobDetailHeader({
  jobId,
  title,
  companyId,
  companyName,
  logoUrl,
  status,
  location,
  employmentType,
  openings,
  postedAt,
  publicUrl,
}: JobDetailHeaderProps) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <CompanyLogo
          companyId={companyId}
          name={companyName}
          logoUrl={logoUrl}
          size={56}
          className="hidden sm:flex"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <CompanyLogo
              companyId={companyId}
              name={companyName}
              logoUrl={logoUrl}
              size={44}
              className="sm:hidden"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <h1 className="text-xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-2xl">
                  {title}
                </h1>
                <JobStatusBadge status={status} />
              </div>
              <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
                <span className="font-medium text-[var(--color-fg)]">{companyName}</span>
                <span className="mx-2" aria-hidden="true">
                  ·
                </span>
                <span>Job ID {jobId}</span>
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[var(--color-fg-muted)]">
            <Chip icon={<MapPin className="size-4" />}>{location}</Chip>
            <Chip icon={<Briefcase className="size-4" />}>
              {EMPLOYMENT_LABELS[employmentType]}
            </Chip>
            {openings != null && openings > 0 && (
              <Chip icon={<Users className="size-4" />}>
                {openings} {openings === 1 ? 'opening' : 'openings'}
              </Chip>
            )}
            <Chip icon={<Clock className="size-4" />}>Posted {formatListDate(postedAt)}</Chip>
          </div>
        </div>
      </div>

      <div className="mt-5 border-t border-[var(--color-border)] pt-4">
        <JobQuickActions id={jobId} title={title} status={status} publicUrl={publicUrl} />
      </div>
    </div>
  );
}
