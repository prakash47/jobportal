import Link from 'next/link';
import { Badge } from '@jobportal/ui';
import { Briefcase, MapPin } from '@jobportal/ui/icons';
import type { JobDoc } from '@jobportal/search';
import { CompanyLogo } from '../companies/CompanyLogo';
import { JobCardSaveToggle } from '../srp/JobCardSaveToggle';

// Compact "N LPA" salary display: paise → lakhs-per-annum, decimals only when
// they carry information (₹8 LPA, ₹12.5 LPA, ₹1.2 Cr).
function toLpa(paise: number): string {
  const lakhs = paise / 100 / 100_000;
  if (lakhs >= 100) {
    const cr = lakhs / 100;
    return `${Number.isInteger(cr) ? cr : cr.toFixed(1)} Cr`;
  }
  return `${Number.isInteger(lakhs) ? lakhs : lakhs.toFixed(1)}`;
}

function formatSalary(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if (min !== null && max !== null) return `₹${toLpa(min)}–${toLpa(max)} LPA`;
  if (min !== null) return `₹${toLpa(min)}+ LPA`;
  return `Up to ₹${toLpa(max as number)} LPA`;
}

function formatExperience(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  const toY = (m: number) => Math.round(m / 12);
  if (min !== null && max !== null) return `${toY(min)}–${toY(max)} yrs`;
  if (min !== null) return `${toY(min)}+ yrs`;
  return `Up to ${toY(max as number)} yrs`;
}

// Compact relative timestamp for the card footer: today, 3d, 2w, 1mo.
function postedAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export interface RecommendedJobCardProps {
  job: JobDoc;
  /** Resolved server-side from Company.logoUrl (null → initials monogram). */
  logoUrl: string | null;
  /** Proper display name for the primary city (the doc only carries slugs). */
  cityName: string | null;
  isAuthed: boolean;
  initialSaved: boolean;
  returnTo: string;
}

// Dashboard recommendation card: company logo, title/company, a short
// description when the posting has one, icon-led meta (city, experience,
// salary) and a skills footer with the posted age. Flat elevated surface,
// borders over shadows, tokens only (CLAUDE.md §2). The grid column controls
// width, so the card is fully fluid down to phone size.
export function RecommendedJobCard({
  job,
  logoUrl,
  cityName,
  isAuthed,
  initialSaved,
  returnTo,
}: RecommendedJobCardProps) {
  const salary = formatSalary(job.salaryMin, job.salaryMax);
  const exp = formatExperience(job.minExperienceMonths, job.maxExperienceMonths);
  const city = cityName ?? null;

  return (
    <article className="group relative flex flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 transition-colors hover:border-[var(--color-border-strong)] sm:p-5">
      <div className="flex items-start gap-3">
        <CompanyLogo companyId={job.companyId} name={job.companyName} logoUrl={logoUrl} size={44} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-snug tracking-tight">
            {/* Whole-card click: the title link's ::after covers the card. Clamp
                on an inner span so the overlay isn't clipped by overflow:hidden. */}
            <Link
              href={`/job/${job.canonicalSlug}`}
              className="text-[var(--color-fg)] transition-colors after:absolute after:inset-0 after:content-[''] group-hover:text-[var(--color-primary-600)]"
            >
              <span className="line-clamp-2">{job.title}</span>
            </Link>
          </h3>
          <Link
            href={`/company/${job.companySlug}-overview-${job.companyId}`}
            className="relative z-10 mt-0.5 block truncate text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
          >
            {job.companyName}
          </Link>
        </div>
        <span className="relative z-10 shrink-0">
          <JobCardSaveToggle
            jobId={job.id}
            jobSlug={job.canonicalSlug}
            isAuthed={isAuthed}
            initialSaved={initialSaved}
            returnTo={returnTo}
          />
        </span>
      </div>

      {job.shortDescription ? (
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-[var(--color-fg-muted)]">
          {job.shortDescription}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-[var(--color-fg-muted)]">
        {city && (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{city}</span>
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

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3">
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {job.skills.slice(0, 4).map((s) => (
            <Badge key={s} variant="neutral">
              {s}
            </Badge>
          ))}
          {job.skills.length > 4 && <Badge variant="neutral">+{job.skills.length - 4}</Badge>}
        </div>
        <span className="shrink-0 text-xs text-[var(--color-fg-muted)]">
          {postedAgo(job.postedAt)}
        </span>
      </div>
    </article>
  );
}
