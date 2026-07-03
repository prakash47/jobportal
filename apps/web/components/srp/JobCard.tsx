import Link from 'next/link';
import { Badge } from '@jobportal/ui';
import { Briefcase, MapPin } from '@jobportal/ui/icons';
import type { JobDoc } from '@jobportal/search';
import { CompanyLogo } from '../companies/CompanyLogo';
import { JobCardSaveToggle } from './JobCardSaveToggle';
import { formatExperienceMonths, formatSalaryLpa, postedAgo } from '../../lib/job/format';

export interface JobCardProps {
  job: JobDoc;
  /** Resolved server-side from Company.logoUrl (null → initials monogram). */
  logoUrl?: string | null;
  /** Proper display name for the primary city (the ES doc only carries slugs). */
  cityName?: string | null;
  isAuthed?: boolean;
  initialSaved?: boolean;
  /** Same-origin path login should bounce back to (e.g. '/jobs?q=react'). */
  returnTo?: string;
}

// SRP result card: company logo, title/company, a short description when the
// posting has one, icon-led meta (city, experience, salary), and a skills
// footer with the posted age. Flat elevated surface, borders over shadows,
// tokens only (CLAUDE.md §2). Width is owned by the SrpShell grid column, so
// the card is fully fluid down to phone size.
export function JobCard({
  job,
  logoUrl = null,
  cityName = null,
  isAuthed = false,
  initialSaved = false,
  returnTo,
}: JobCardProps) {
  const salary = formatSalaryLpa(job.salaryMin, job.salaryMax);
  const exp = formatExperienceMonths(job.minExperienceMonths, job.maxExperienceMonths);
  // The doc only carries a slug; prefer the resolved name, fall back to a
  // de-slugified label so a missing lookup never shows raw "new-delhi".
  const city = cityName ?? (job.primaryCitySlug ? job.primaryCitySlug.replaceAll('-', ' ') : null);

  return (
    <article className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 transition-colors hover:border-[var(--color-border-strong)] sm:p-5">
      <div className="flex items-start gap-3 sm:gap-4">
        <CompanyLogo
          companyId={job.companyId}
          name={job.companyName}
          logoUrl={logoUrl}
          size={48}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold leading-snug tracking-tight sm:text-base">
            <Link
              href={`/job/${job.canonicalSlug}`}
              className="line-clamp-2 text-[var(--color-fg)] transition-colors group-hover:text-[var(--color-primary-600)]"
            >
              {job.title}
            </Link>
          </h2>
          <Link
            href={`/company/${job.companySlug}-overview-${job.companyId}`}
            className="mt-0.5 inline-block max-w-full truncate align-bottom text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
          >
            {job.companyName}
          </Link>
        </div>
        <JobCardSaveToggle
          jobId={job.id}
          jobSlug={job.canonicalSlug}
          isAuthed={isAuthed}
          initialSaved={initialSaved}
          {...(returnTo ? { returnTo } : {})}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-[var(--color-fg-muted)]">
        {city && (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate capitalize">{city}</span>
          </span>
        )}
        {exp && (
          <span className="inline-flex items-center gap-1.5">
            <Briefcase className="size-3.5 shrink-0" aria-hidden="true" />
            {exp}
          </span>
        )}
        {salary && <span className="font-medium text-[var(--color-fg)]">{salary}</span>}
      </div>

      {job.shortDescription ? (
        <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-[var(--color-fg-muted)]">
          {job.shortDescription}
        </p>
      ) : null}

      {job.skills.length > 0 && (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3">
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {job.skills.slice(0, 5).map((s) => (
              <Badge key={s} variant="neutral">
                {s}
              </Badge>
            ))}
            {job.skills.length > 5 && <Badge variant="neutral">+{job.skills.length - 5}</Badge>}
          </div>
          <span className="shrink-0 text-xs text-[var(--color-fg-muted)]">{postedAgo(job.postedAt)}</span>
        </div>
      )}
      {job.skills.length === 0 && (
        <div className="mt-3 text-xs text-[var(--color-fg-muted)]">{postedAgo(job.postedAt)}</div>
      )}
    </article>
  );
}
