import Link from 'next/link';
import { Badge } from '@jobportal/ui';
import { MapPin } from '@jobportal/ui/icons';
import { CompanyLogo } from '../companies/CompanyLogo';
import type { HeroJob } from '../../lib/home/queries';

// The hero's signature "wow": a server-only cluster of 3 REAL active jobs in
// stacked, slightly-rotated frosted-glass cards over the aurora — proof of real
// inventory the way Linear/Clerk hero shots work. 100% SSR (no client island),
// real fields only, CLS-safe (fixed aspect-ratio stage), reduced-motion safe.

const WORK_MODE_LABEL: Record<string, string> = {
  ONSITE: 'On-site',
  REMOTE: 'Remote',
  HYBRID: 'Hybrid',
};

function formatSalary(minPaise: number | null, maxPaise: number | null): string | null {
  if (minPaise === null && maxPaise === null) return null;
  const toLpa = (paise: number) => {
    const lpa = paise / 10_000_000; // paise → ₹ → lakhs
    return lpa >= 100 ? `${(lpa / 100).toFixed(1)} Cr` : `${lpa.toFixed(0)} LPA`;
  };
  if (minPaise !== null && maxPaise !== null) return `₹${toLpa(minPaise)}–${toLpa(maxPaise)}`;
  if (minPaise !== null) return `₹${toLpa(minPaise)}+`;
  return `up to ₹${toLpa(maxPaise as number)}`;
}

function postedAgo(d: Date): string {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function JobCardInner({ job, isNew = false }: { job: HeroJob; isNew?: boolean }) {
  const salary = formatSalary(job.salaryMinPaise, job.salaryMaxPaise);
  return (
    <>
      <div className="flex items-start gap-3">
        <CompanyLogo companyId={job.companyId} name={job.companyName} logoUrl={job.companyLogoUrl} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs text-[var(--color-fg-muted)]">{job.companyName}</div>
          <h3 className="mt-0.5 line-clamp-2 text-base font-semibold leading-tight text-[var(--color-fg)]">
            {job.title}
          </h3>
        </div>
        {isNew && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-accent-50)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-accent-700)]">
            <span className="size-1.5 rounded-full bg-[var(--color-accent-500)]" aria-hidden="true" />
            New
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[var(--color-fg-muted)]">
        {job.cityName && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden="true" />
            {job.cityName}
          </span>
        )}
        {salary && (
          <span className="font-semibold tabular-nums text-[var(--color-primary-700)]">{salary}</span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="neutral">{WORK_MODE_LABEL[job.workMode] ?? job.workMode}</Badge>
        <Badge variant="neutral">Posted {postedAgo(job.postedAt)}</Badge>
      </div>
    </>
  );
}

export function HeroJobCluster({ jobs }: { jobs: HeroJob[] }) {
  const front = jobs[0];
  if (!front) return null;
  const mid = jobs[1] ?? front;
  const back = jobs[2] ?? front;

  return (
    <>
      {/* Desktop: fanned 3-card stack floating over the aurora. */}
      <div className="relative mx-auto hidden aspect-[5/6] w-full max-w-sm md:block">
        <div
          aria-hidden="true"
          style={{ animationDelay: '300ms' }}
          className="rise glass absolute inset-x-0 top-0 z-10 -rotate-6 rounded-2xl p-5 opacity-80"
        >
          <JobCardInner job={back} />
        </div>
        <div
          aria-hidden="true"
          style={{ animationDelay: '340ms' }}
          className="rise glass absolute inset-x-0 top-[12%] z-20 rotate-3 rounded-2xl p-5 opacity-90"
        >
          <JobCardInner job={mid} />
        </div>
        <Link
          href={`/job/${front.canonicalSlug}`}
          style={{ animationDelay: '380ms' }}
          className="rise glass-lg group absolute inset-x-0 top-[27%] z-30 block rounded-2xl p-5 transition-transform duration-[var(--duration-base)] ease-[var(--ease-out)] hover:-translate-y-1.5 motion-reduce:hover:translate-y-0"
        >
          <JobCardInner job={front} isNew />
        </Link>
      </div>

      {/* Mobile: a single static proof card (keeps text H1 as the LCP element). */}
      <div className="md:hidden">
        <Link href={`/job/${front.canonicalSlug}`} className="glass-lg block rounded-2xl p-5">
          <JobCardInner job={front} isNew />
        </Link>
      </div>
    </>
  );
}
