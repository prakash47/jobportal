import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge } from '@jobportal/ui';
import { Briefcase, Building2, Clock, IndianRupee, MapPin } from '@jobportal/ui/icons';
import { CompanyLogo } from '../companies/CompanyLogo';
import {
  EMPLOYMENT_LABELS,
  WORK_MODE_LABELS,
  formatExperienceYears,
  formatSalaryLpa,
} from '../../lib/job/format';

function postedAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'a week ago';
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

export interface JobHeroProps {
  title: string;
  companyName: string;
  companySlug: string;
  companyId: number;
  logoUrl: string | null;
  postedAt: string;
  cityNames: string[];
  salaryMinPaise: number | null;
  salaryMaxPaise: number | null;
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  employmentType: string;
  workMode: string;
  skillNames: string[];
  /** Apply / Save / Share action row (client components), rendered by the page. */
  actions: ReactNode;
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

// Full-width hero card for the job-detail page: company logo, title, company +
// posted line, an at-a-glance meta row, skill badges, and the action row.
export function JobHero({
  title,
  companyName,
  companySlug,
  companyId,
  logoUrl,
  postedAt,
  cityNames,
  salaryMinPaise,
  salaryMaxPaise,
  experienceMinYears,
  experienceMaxYears,
  employmentType,
  workMode,
  skillNames,
  actions,
}: JobHeroProps) {
  const salary = formatSalaryLpa(salaryMinPaise, salaryMaxPaise);
  const exp = formatExperienceYears(experienceMinYears, experienceMaxYears);
  const location = cityNames.length > 0 ? cityNames.join(', ') : null;

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
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-2xl">
                {title}
              </h1>
              <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
                <Link
                  href={`/company/${companySlug}-overview-${companyId}`}
                  className="font-medium text-[var(--color-fg)] hover:underline"
                >
                  {companyName}
                </Link>
                <span className="mx-2" aria-hidden="true">
                  ·
                </span>
                <span>Posted {postedAgo(postedAt)}</span>
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[var(--color-fg-muted)]">
            {location && <Chip icon={<MapPin className="size-4" />}>{location}</Chip>}
            {exp && <Chip icon={<Briefcase className="size-4" />}>{exp}</Chip>}
            {salary && (
              <Chip icon={<IndianRupee className="size-4" />}>
                <span className="font-medium text-[var(--color-fg)]">{salary}</span>
              </Chip>
            )}
            <Chip icon={<Clock className="size-4" />}>
              {EMPLOYMENT_LABELS[employmentType] ?? employmentType}
            </Chip>
            <Chip icon={<Building2 className="size-4" />}>
              {WORK_MODE_LABELS[workMode] ?? workMode}
            </Chip>
          </div>

          {skillNames.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {skillNames.map((s) => (
                <Badge key={s} variant="neutral">
                  {s}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 border-t border-[var(--color-border)] pt-4">{actions}</div>
    </div>
  );
}
