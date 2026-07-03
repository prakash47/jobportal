import Link from 'next/link';
import { prisma } from '@jobportal/db';
import { searchJobs, type JobDoc } from '@jobportal/search';
import { ArrowRight } from '@jobportal/ui/icons';
import { CompanyLogo } from '../companies/CompanyLogo';
import { formatSalaryLpa } from '../../lib/job/format';

export interface RelatedRolesProps {
  jobId: number;
  /** Exclude the current posting's company — this rail is "other companies". */
  companyId: number;
  skillSlugs: string[];
  industrySlug: string | null;
}

// One compact related-role row: other-company logo + title + company + a
// city · salary meta line.
function Row({
  job,
  logoUrl,
  cityName,
}: {
  job: JobDoc;
  logoUrl: string | null;
  cityName: string | null;
}) {
  const salary = formatSalaryLpa(job.salaryMin, job.salaryMax);
  const meta = [cityName, salary].filter(Boolean).join(' · ');
  return (
    <li>
      <Link
        href={`/job/${job.canonicalSlug}`}
        className="group flex items-start gap-3 py-3 first:pt-0 last:pb-0"
      >
        <CompanyLogo companyId={job.companyId} name={job.companyName} logoUrl={logoUrl} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--color-fg)] group-hover:text-[var(--color-primary-600)] group-hover:underline">
            {job.title}
          </p>
          <p className="mt-0.5 truncate text-xs text-[var(--color-fg-muted)]">{job.companyName}</p>
          {meta && <p className="mt-0.5 truncate text-xs text-[var(--color-fg-muted)]">{meta}</p>}
        </div>
      </Link>
    </li>
  );
}

// Right-rail feed: ACTIVE postings sharing skills + industry with the current
// job, at DIFFERENT companies, newest first — the "same role elsewhere" widget.
// Company logos + city names aren't in the ES doc, so they're resolved in two
// batched Prisma lookups keyed by the visible hits (no per-row query). Renders a
// calm empty state rather than vanishing, so the 3-column layout stays balanced.
export async function RelatedRoles({ jobId, companyId, skillSlugs, industrySlug }: RelatedRolesProps) {
  const LIMIT = 6;
  // Match on shared skills (ES `terms` = any-of, so this is "same kind of
  // role") — NOT skills AND industry, which is so narrow it usually returns
  // only the current company. Fall back to industry, then to recent ACTIVE, so
  // the rail is populated for postings with sparse data too.
  const params =
    skillSlugs.length > 0 ? { skillSlugs } : industrySlug ? { industrySlug } : {};
  let hits: JobDoc[] = [];
  try {
    const results = await searchJobs({
      ...params,
      status: 'ACTIVE',
      sort: 'recent',
      pageSize: LIMIT + 24, // headroom for excluding the current job + same-company hits
    });
    hits = results.hits.filter((j) => j.id !== jobId && j.companyId !== companyId).slice(0, LIMIT);
  } catch {
    hits = [];
  }

  const heading = <h2 className="mb-3 text-sm font-semibold text-[var(--color-fg)]">Similar roles at other companies</h2>;

  if (hits.length === 0) {
    return (
      <section
        aria-label="Similar roles at other companies"
        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5"
      >
        {heading}
        <p className="text-sm text-[var(--color-fg-muted)]">
          No similar roles at other companies right now.
        </p>
        <Link
          href="/jobs"
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--color-primary-600)] hover:underline"
        >
          Browse all jobs
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </section>
    );
  }

  const companyIds = [...new Set(hits.map((j) => j.companyId))];
  const citySlugs = [...new Set(hits.flatMap((j) => (j.primaryCitySlug ? [j.primaryCitySlug] : [])))];
  const [companies, cities] = await Promise.all([
    prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, logoUrl: true } }),
    citySlugs.length > 0
      ? prisma.city.findMany({ where: { slug: { in: citySlugs } }, select: { slug: true, name: true } })
      : Promise.resolve<{ slug: string; name: string }[]>([]),
  ]);
  const logoByCompanyId = new Map(companies.map((c) => [c.id, c.logoUrl]));
  const cityNameBySlug = new Map(cities.map((c) => [c.slug, c.name]));

  return (
    <section
      aria-label="Similar roles at other companies"
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5"
    >
      {heading}
      <ul className="divide-y divide-[var(--color-border)]">
        {hits.map((j) => (
          <Row
            key={j.id}
            job={j}
            logoUrl={logoByCompanyId.get(j.companyId) ?? null}
            cityName={j.primaryCitySlug ? (cityNameBySlug.get(j.primaryCitySlug) ?? null) : null}
          />
        ))}
      </ul>
    </section>
  );
}
