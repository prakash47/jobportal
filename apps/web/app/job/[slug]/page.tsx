import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { prisma } from '@jobportal/db';
import { isFlagEnabled, FLAG } from '@jobportal/feature-flags';
import { Breadcrumbs, Container } from '@jobportal/ui';
import { SiteShell } from '../../../components/shell/SiteShell';
import {
  AboutCompanyCard,
  ApplyButton,
  ClosedJobNotice,
  JobBody,
  JobHero,
  JobOverviewCard,
  ReportJobButton,
  SaveButton,
  ShareButtons,
} from '../../../components/job';
// RelatedRoles is server-only (ES + Prisma) — deep import, not via the barrel.
import { RelatedRoles } from '../../../components/job/RelatedRoles';
import { readApplied, readSaved, readUserFromCookie } from '../../../lib/job';
import { canViewJob } from '@jobportal/domain/job-visibility';
import { readApplyQuota } from '../../../lib/applications/quota-state';
import { classifyQuota } from '../../../lib/applications/quota-ui-state';
import { jobPosting } from '../../../lib/seo/json-ld';
import { parseJobSlug } from '@jobportal/domain/slug';
import { publicAssetUrl } from '../../../lib/assets';

const SITE = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

// SRS §4.2.10 — edge TTL 60s + SWR 1h. Next.js ISR sets s-maxage=60 from this;
// stale-while-revalidate is added at the Cloudflare cache rule layer (CLAUDE.md §6).
export const revalidate = 60;

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function loadJob(id: number) {
  return prisma.job.findUnique({
    where: { id },
    include: {
      company: { select: { name: true, slug: true, logoUrl: true, websiteUrl: true } },
      primaryCity: { select: { name: true } },
      industry: { select: { slug: true, name: true } },
    },
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const parsed = parseJobSlug(slug);
  if (!parsed) return { title: 'Job not found — JobPortal' };

  const job = await loadJob(parsed.id);
  if (!job) return { title: 'Job not found — JobPortal' };

  // Same visibility rule the page body applies. generateMetadata runs
  // independently of the component, so without this an unapproved job's title
  // would still be emitted into <title> and og:title for a viewer the page
  // itself is about to 404.
  if (!(await canViewJob(await readUserFromCookie(), job))) {
    return { title: 'Job not found — JobPortal' };
  }

  const noindex = job.status !== 'ACTIVE';
  const title = `${job.title} at ${job.company.name} — JobPortal`;
  const description = job.shortDescription ?? job.description.slice(0, 160);

  return {
    title,
    description,
    alternates: { canonical: `${SITE}/job/${job.canonicalSlug}` },
    robots: noindex ? { index: false, follow: true } : undefined,
  };
}

export default async function JobDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const parsed = parseJobSlug(slug);
  if (!parsed) notFound();

  const job = await loadJob(parsed.id);
  if (!job) notFound();

  // Resolve the viewer BEFORE anything else acts on the row. A job that has
  // never been public (DRAFT / PENDING_MODERATION) must be indistinguishable
  // from a non-existent one for everyone except its owner, its collaborators
  // and platform admins — otherwise admin moderation is decorative, since
  // anyone holding the URL could read the posting the admin has not approved.
  //
  // This has to run ahead of the canonical redirect below: permanentRedirect()
  // puts the real canonicalSlug — which contains the job title — in the
  // Location header, so redirecting first would disclose the title of an
  // unapproved job to an unauthenticated caller who simply guessed the id.
  const user = await readUserFromCookie();
  if (!(await canViewJob(user, job))) notFound();

  // SRS §6.1 — slug drift handling. The numeric ID is the permalink; the
  // descriptive slug can change. Always 308 to the canonical form.
  if (slug !== job.canonicalSlug) {
    permanentRedirect(`/job/${job.canonicalSlug}`);
  }

  const [skills, cities] = await Promise.all([
    job.skillIds.length > 0
      ? prisma.skill.findMany({
          where: { id: { in: job.skillIds } },
          select: { id: true, slug: true, name: true },
        })
      : Promise.resolve<{ id: number; slug: string; name: string }[]>([]),
    job.cityIds.length > 0
      ? prisma.city.findMany({
          where: { id: { in: job.cityIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve<{ id: number; name: string }[]>([]),
  ]);

  const userId = user?.sub;
  const [applied, saved, quota, reportingEnabled] = await Promise.all([
    userId ? readApplied(userId, job.id) : Promise.resolve(false),
    userId ? readSaved(userId, job.id) : Promise.resolve(false),
    userId ? readApplyQuota() : Promise.resolve(null),
    // Layer 2 for moderation.reports.enabled. NOT user-scoped and NOT gated on
    // sign-in: reporting is open to anonymous visitors, which is most of this
    // page's traffic. There is deliberately no Layer 1 middleware gate — the
    // gated thing is an action, and /job/[slug] must keep serving either way.
    // POST /v1/reports re-checks this and is the enforcement point (CLAUDE.md §4).
    isFlagEnabled(FLAG.MODERATION_REPORTS),
  ]);
  const quotaUiState = quota ? classifyQuota(quota) : 'normal';

  const cityNames = cities.length > 0 ? cities.map((c) => c.name) : (job.primaryCity ? [job.primaryCity.name] : []);
  const skillNames = skills.map((s) => s.name);
  const skillSlugs = skills.map((s) => s.slug);

  const canonicalUrl = `${SITE}/job/${job.canonicalSlug}`;
  const isActive = job.status === 'ACTIVE';

  // SRS §4.2.2 — JobPosting JSON-LD with all required fields for Google for Jobs.
  const monthsExp = (() => {
    if (job.experienceMinYears !== null) return job.experienceMinYears * 12;
    if (job.experienceMaxYears !== null) return job.experienceMaxYears * 12;
    return null;
  })();

  const jsonLd = jobPosting({
    title: job.title,
    description: job.description,
    datePosted: job.postedAt.toISOString(),
    ...(job.expiresAt ? { validThrough: job.expiresAt.toISOString() } : {}),
    // Google for Jobs employmentType enum aligns with our EmploymentType values.
    employmentType: job.employmentType,
    hiringOrganization: {
      name: job.company.name,
      ...(job.company.websiteUrl ? { sameAs: job.company.websiteUrl } : {}),
      ...(publicAssetUrl(job.company.logoUrl) ? { logo: publicAssetUrl(job.company.logoUrl)! } : {}),
    },
    ...(cityNames.length > 0
      ? {
          jobLocation: {
            addressLocality: cityNames[0]!,
            addressCountry: 'IN',
          },
        }
      : {}),
    ...(job.salaryMinPaise !== null || job.salaryMaxPaise !== null
      ? {
          baseSalary: {
            currency: 'INR',
            ...(job.salaryMinPaise !== null ? { minValue: Math.round(job.salaryMinPaise / 100) } : {}),
            ...(job.salaryMaxPaise !== null ? { maxValue: Math.round(job.salaryMaxPaise / 100) } : {}),
            unitText: 'YEAR',
          },
        }
      : {}),
    ...(monthsExp !== null ? { experienceRequirements: { monthsOfExperience: monthsExp } } : {}),
    identifier: { name: 'JobPortal', value: String(job.id) },
    url: canonicalUrl,
    directApply: true,
  });

  // SRS §4.11.16-17 — Layer 2 inline hint. Calm sentence, never a modal, never
  // an upsell on Day 0 (subscription system OFF).
  const actions = (
    <div className="space-y-3">
      {quotaUiState === 'warning' && quota && (
        <p className="text-xs text-[var(--color-fg-muted)]">
          You&rsquo;ve used {quota.count} of {quota.limit} applications today — choose carefully.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <ApplyButton
          jobId={job.id}
          jobSlug={job.canonicalSlug}
          isAuthed={user !== null}
          initialApplied={applied}
          disabled={!isActive}
          quota={quota}
        />
        <SaveButton
          jobId={job.id}
          jobSlug={job.canonicalSlug}
          isAuthed={user !== null}
          initialSaved={saved}
        />
        <div className="ml-auto flex items-center gap-2">
          <ShareButtons url={canonicalUrl} title={job.title} />
          {/* Sits with Share rather than beside Apply: reporting is a rare,
              deliberate act, and giving it equal visual weight to the primary
              conversion would be wrong on every honest posting. */}
          {reportingEnabled && <ReportJobButton jobId={job.id} />}
        </div>
      </div>
    </div>
  );

  return (
    <SiteShell>
      <Container className="py-8 sm:py-10">
        <Script
          id="ldjson-jobposting"
          type="application/ld+json"
          strategy="afterInteractive"
          // eslint-disable-next-line react/no-danger -- JSON.stringify output is JSON; we render inside <script>.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />

        <div className="space-y-6">
        <Breadcrumbs
          items={[{ label: 'Home', href: '/' }, { label: 'Jobs', href: '/jobs' }, { label: job.title }]}
        />

        {!isActive && <ClosedJobNotice status={job.status} />}

        <JobHero
          title={job.title}
          companyName={job.company.name}
          companySlug={job.company.slug}
          companyId={job.companyId}
          logoUrl={publicAssetUrl(job.company.logoUrl)}
          postedAt={job.postedAt.toISOString()}
          cityNames={cityNames}
          salaryMinPaise={job.salaryMinPaise}
          salaryMaxPaise={job.salaryMaxPaise}
          experienceMinYears={job.experienceMinYears}
          experienceMaxYears={job.experienceMaxYears}
          employmentType={job.employmentType}
          workMode={job.workMode}
          skillNames={skillNames}
          actions={actions}
        />

        {/* 3-column layout on lg+: left overview/company rail, main description,
            right "similar roles at other companies" rail. Stacks on mobile. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_6fr_3fr]">
          <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
            <JobOverviewCard
              cityNames={cityNames}
              salaryMinPaise={job.salaryMinPaise}
              salaryMaxPaise={job.salaryMaxPaise}
              experienceMinYears={job.experienceMinYears}
              experienceMaxYears={job.experienceMaxYears}
              employmentType={job.employmentType}
              workMode={job.workMode}
            />
            <AboutCompanyCard
              companyId={job.companyId}
              companyName={job.company.name}
              companySlug={job.company.slug}
              logoUrl={publicAssetUrl(job.company.logoUrl)}
              websiteUrl={job.company.websiteUrl}
              industryName={job.industry?.name ?? null}
            />
          </aside>

          <div className="min-w-0">
            <JobBody description={job.description} descriptionMarkdown={job.descriptionMarkdown} />
          </div>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            <RelatedRoles
              jobId={job.id}
              companyId={job.companyId}
              skillSlugs={skillSlugs}
              industrySlug={job.industry?.slug ?? null}
            />
          </aside>
        </div>
        </div>
      </Container>
    </SiteShell>
  );
}
