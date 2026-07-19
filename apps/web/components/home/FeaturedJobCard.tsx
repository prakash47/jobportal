import Link from 'next/link';
import { Badge } from '@jobportal/ui';
import { MapPin } from '@jobportal/ui/icons';
import type { FeaturedJob } from '../../lib/home/queries';
import { CompanyLogo } from '../companies/CompanyLogo';
import { formatSalaryLpa, postedAgo, WORK_MODE_LABELS } from '../../lib/job/format';

// Flat "Latest jobs" card — the homepage's real-inventory proof. Mirrors the SRP
// JobCard system (logo-left, whole-card stretched link, icon-led meta, footer
// with posted age) but reads the Prisma FeaturedJob shape, so it only shows
// fields the home query actually carries (no invented skills/experience). 100%
// SSR, borders over shadows, tokens only (CLAUDE.md §2).
export function FeaturedJobCard({ job }: { job: FeaturedJob }) {
  const salary = formatSalaryLpa(job.salaryMinPaise, job.salaryMaxPaise);
  const age = postedAgo(job.postedAt.toISOString());
  const isNew = age === 'today' || age === '1d ago';
  const workMode = WORK_MODE_LABELS[job.workMode] ?? job.workMode;

  return (
    <article className="group relative flex h-full flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 transition-colors hover:border-[var(--color-border-strong)] sm:p-5">
      <div className="flex items-start gap-3">
        <CompanyLogo
          companyId={job.companyId}
          name={job.companyName}
          logoUrl={job.companyLogoUrl}
          size={44}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-snug tracking-tight">
            {/* The title link's ::after stretches over the whole card. Sibling
                links below get relative z-10 to stay clickable above it. */}
            <Link
              href={`/job/${job.canonicalSlug}`}
              className="text-[var(--color-fg)] transition-colors after:absolute after:inset-0 after:content-[''] group-hover:text-[var(--color-primary-600)]"
            >
              <span className="line-clamp-2">{job.title}</span>
            </Link>
          </h3>
          <span className="mt-0.5 block truncate text-sm text-[var(--color-fg-muted)]">
            {job.companyName}
          </span>
        </div>
        {isNew && (
          <span className="relative z-10 inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-accent-50)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-accent-700)]">
            <span className="size-1.5 rounded-full bg-[var(--color-accent-500)]" aria-hidden="true" />
            New
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-[var(--color-fg-muted)]">
        {job.cityName && (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{job.cityName}</span>
          </span>
        )}
        {salary && <span className="font-medium text-[var(--color-fg)]">{salary}</span>}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3">
        <Badge variant="neutral">{workMode}</Badge>
        <span className="shrink-0 text-xs text-[var(--color-fg-muted)]">{age}</span>
      </div>
    </article>
  );
}
