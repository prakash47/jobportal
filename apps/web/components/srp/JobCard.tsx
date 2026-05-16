import Link from 'next/link';
import { Badge, Card, CardContent, CardHeader } from '@jobportal/ui';
import { Briefcase, MapPin } from '@jobportal/ui/icons';
import type { JobDoc } from '@jobportal/search';
import { JobCardSaveToggle } from './JobCardSaveToggle';

function formatPostedAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'a week ago';
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

function formatSalary(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  // Stored as paise. Display as INR lakh / crore for readability.
  const toLpa = (v: number) => {
    const lakhs = v / 100_000_00; // paise → INR → lakhs
    if (lakhs >= 100) return `${(lakhs / 100).toFixed(1)} Cr`;
    return `${lakhs.toFixed(1)} L`;
  };
  if (min !== null && max !== null) return `₹${toLpa(min)} – ₹${toLpa(max)}`;
  if (min !== null) return `₹${toLpa(min)}+`;
  return `up to ₹${toLpa(max as number)}`;
}

function formatExperience(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  const toY = (m: number) => Math.round(m / 12);
  if (min !== null && max !== null) return `${toY(min)}–${toY(max)} yrs`;
  if (min !== null) return `${toY(min)}+ yrs`;
  return `up to ${toY(max as number)} yrs`;
}

export interface JobCardProps {
  job: JobDoc;
  isAuthed?: boolean;
  initialSaved?: boolean;
  /** Same-origin path login should bounce back to (e.g. '/jobs?q=react'). */
  returnTo?: string;
}

export function JobCard({ job, isAuthed = false, initialSaved = false, returnTo }: JobCardProps) {
  const salary = formatSalary(job.salaryMin, job.salaryMax);
  const exp = formatExperience(job.minExperienceMonths, job.maxExperienceMonths);

  return (
    <Card className="transition-colors hover:border-[var(--color-border-strong)]">
      <CardHeader className="gap-2">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              href={`/job/${job.canonicalSlug}`}
              className="text-base font-semibold leading-tight tracking-tight text-[var(--color-fg)] hover:underline"
            >
              {job.title}
            </Link>
            <Link
              href={`/company/${job.companySlug}-overview-${job.companyId}`}
              className="mt-0.5 inline-block text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
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
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--color-fg-muted)]">
          {job.primaryCitySlug && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5" aria-hidden="true" />
              {/* primaryCitySlug is a slug; display untransformed for now —
                  proper city names land when the SRP wires the lookup map. */}
              {job.primaryCitySlug.replaceAll('-', ' ')}
            </span>
          )}
          {exp && (
            <span className="inline-flex items-center gap-1.5">
              <Briefcase className="size-3.5" aria-hidden="true" />
              {exp}
            </span>
          )}
          {salary && <span>{salary}</span>}
          <span className="ml-auto text-xs text-[var(--color-fg-subtle)]">
            Posted {formatPostedAgo(job.postedAt)}
          </span>
        </div>
        {job.skills.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {job.skills.slice(0, 6).map((s) => (
              <Badge key={s} variant="neutral">
                {s}
              </Badge>
            ))}
            {job.skills.length > 6 && (
              <Badge variant="neutral">+{job.skills.length - 6}</Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
