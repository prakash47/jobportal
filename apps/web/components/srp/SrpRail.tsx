import Link from 'next/link';
import { prisma } from '@jobportal/db';
import { searchJobs, type JobDoc } from '@jobportal/search';
import { ArrowRight, Bell } from '@jobportal/ui/icons';
import { CompanyLogo } from '../companies/CompanyLogo';
import { formatSalaryLpa } from '../../lib/job/format';

export interface SrpRailProps {
  /** Visible results — seed the "roles you might like" query + the exclusion set. */
  hits: JobDoc[];
  /** Where the "Create alert" button points (the current search, ideally). */
  alertHref: string;
}

// One compact rail row: other-company logo + title + company + city · salary.
function Row({ job, logoUrl, cityName }: { job: JobDoc; logoUrl: string | null; cityName: string | null }) {
  const salary = formatSalaryLpa(job.salaryMin, job.salaryMax);
  const meta = [cityName, salary].filter(Boolean).join(' · ');
  return (
    <li>
      <Link href={`/job/${job.canonicalSlug}`} className="group flex items-start gap-3 py-3 first:pt-0 last:pb-0">
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

// The SRP right rail: a "Create job alert for this search" conversion card on
// top, then "Roles at other companies" — one posting per company (so the list
// shows variety, not five roles from one employer), matched on the skills of
// the roles already on the page, newest first, excluding the jobs shown here.
// Company logos + city names aren't in the ES doc, so they're resolved in two
// batched Prisma lookups keyed by the visible rows (no per-row query). Renders
// inside a bordered card so the 3-column layout stays balanced.
export async function SrpRail({ hits, alertHref }: SrpRailProps) {
  const LIMIT = 5;
  // Seed the query from the skills of the visible results (any-of terms = "the
  // same kind of role"). Fall back to recent ACTIVE when there are no hits.
  const seedSkills = [...new Set(hits.flatMap((j) => j.skillSlugs))].slice(0, 8);
  const excludeJobIds = new Set(hits.map((j) => j.id));

  let rows: JobDoc[] = [];
  try {
    const results = await searchJobs({
      ...(seedSkills.length > 0 ? { skillSlugs: seedSkills } : {}),
      status: 'ACTIVE',
      sort: 'recent',
      pageSize: LIMIT + 40, // headroom for excluding page jobs + de-duping companies
    });
    const seenCompanies = new Set<number>();
    for (const job of results.hits) {
      if (excludeJobIds.has(job.id)) continue;
      if (seenCompanies.has(job.companyId)) continue; // one role per company
      seenCompanies.add(job.companyId);
      rows.push(job);
      if (rows.length >= LIMIT) break;
    }
  } catch {
    rows = [];
  }

  let logoByCompanyId = new Map<number, string | null>();
  let cityNameBySlug = new Map<string, string>();
  if (rows.length > 0) {
    const companyIds = [...new Set(rows.map((j) => j.companyId))];
    const citySlugs = [...new Set(rows.flatMap((j) => (j.primaryCitySlug ? [j.primaryCitySlug] : [])))];
    const [companies, cities] = await Promise.all([
      prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, logoUrl: true } }),
      citySlugs.length > 0
        ? prisma.city.findMany({ where: { slug: { in: citySlugs } }, select: { slug: true, name: true } })
        : Promise.resolve<{ slug: string; name: string }[]>([]),
    ]);
    logoByCompanyId = new Map(companies.map((c) => [c.id, c.logoUrl]));
    cityNameBySlug = new Map(cities.map((c) => [c.slug, c.name]));
  }

  return (
    <div className="space-y-4">
      <section
        aria-label="Job alert"
        className="rounded-xl border border-[var(--color-accent-500)]/30 bg-[var(--color-accent-50)] p-5"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-primary-700)]">
          <Bell className="size-4" aria-hidden="true" />
          Get job alerts
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-primary-700)]/85">
          Be the first to know when new roles match this search.
        </p>
        <Link
          href={alertHref}
          className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--color-primary-600)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-700)]"
        >
          Create alert
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </section>

      {rows.length > 0 && (
        <section
          aria-label="Roles at other companies"
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5"
        >
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-fg)]">Roles at other companies</h2>
          <ul className="divide-y divide-[var(--color-border)]">
            {rows.map((j) => (
              <Row
                key={j.id}
                job={j}
                logoUrl={logoByCompanyId.get(j.companyId) ?? null}
                cityName={j.primaryCitySlug ? (cityNameBySlug.get(j.primaryCitySlug) ?? null) : null}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
