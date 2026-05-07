import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { prisma } from '@jobportal/db';
import {
  ApplyButton,
  ClosedJobNotice,
  JobBody,
  JobHeader,
  JobMeta,
  SaveButton,
  ShareButtons,
  SimilarJobs,
} from '../../../components/job';
import { readApplied, readSaved, readUserFromCookie } from '../../../lib/job';
import { jobPosting } from '../../../lib/seo/json-ld';
import { parseJobSlug } from '../../../lib/url/slug';

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

  // SRS §6.1 — slug drift handling. The numeric ID is the permalink; the
  // descriptive slug can change. Always 308 to the canonical form.
  if (slug !== job.canonicalSlug) {
    permanentRedirect(`/job/${job.canonicalSlug}`);
  }

  const [skills, cities, user] = await Promise.all([
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
    readUserFromCookie(),
  ]);

  const userId = user?.sub;
  const [applied, saved] = await Promise.all([
    userId ? readApplied(userId, job.id) : Promise.resolve(false),
    userId ? readSaved(userId, job.id) : Promise.resolve(false),
  ]);

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
    employmentType: 'FULL_TIME',
    hiringOrganization: {
      name: job.company.name,
      ...(job.company.websiteUrl ? { sameAs: job.company.websiteUrl } : {}),
      ...(job.company.logoUrl ? { logo: job.company.logoUrl } : {}),
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

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <Script
        id="ldjson-jobposting"
        type="application/ld+json"
        strategy="afterInteractive"
        // eslint-disable-next-line react/no-danger -- JSON.stringify output is JSON; we render inside <script>.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article className="space-y-8">
        <JobHeader
          title={job.title}
          companyName={job.company.name}
          companySlug={job.company.slug}
          companyId={job.companyId}
          postedAt={job.postedAt.toISOString()}
        />

        {!isActive && <ClosedJobNotice status={job.status} />}

        <JobMeta
          cityNames={cityNames}
          salaryMinPaise={job.salaryMinPaise}
          salaryMaxPaise={job.salaryMaxPaise}
          experienceMinYears={job.experienceMinYears}
          experienceMaxYears={job.experienceMaxYears}
          skillNames={skillNames}
        />

        <div className="flex flex-wrap items-center gap-3 border-y border-[var(--color-border)] py-4">
          <ApplyButton
            jobId={job.id}
            jobSlug={job.canonicalSlug}
            isAuthed={user !== null}
            initialApplied={applied}
            disabled={!isActive}
          />
          <SaveButton
            jobId={job.id}
            jobSlug={job.canonicalSlug}
            isAuthed={user !== null}
            initialSaved={saved}
          />
          <div className="ml-auto">
            <ShareButtons url={canonicalUrl} title={job.title} />
          </div>
        </div>

        <JobBody description={job.description} />

        <SimilarJobs
          jobId={job.id}
          skillSlugs={skillSlugs}
          industrySlug={job.industry?.slug ?? null}
        />
      </article>
    </main>
  );
}
