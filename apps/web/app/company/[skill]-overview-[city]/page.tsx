import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { prisma } from '@jobportal/db';
import {
  CompanyAbout,
  CompanyHero,
  CompanyOpenings,
  CompanyReviews,
} from '../../components/companies';
import { JsonLd } from '../../lib/seo';
import { breadcrumbList, organization } from '../../lib/seo/json-ld';
import { parseCompanySlug } from '../../lib/url/slug';

const SITE = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

// SRS §4.7.2 — company profile is SSR with edge cache. revalidate=3600 →
// Next ISR sets s-maxage=3600. SWR semantics live at the Cloudflare cache
// rule layer per CLAUDE.md §6.
export const revalidate = 3600;

// Route signature is `[skill]-overview-[city]` to satisfy Next 16's
// per-directory slug-name uniqueness rule (the SRP routes already use
// `skill` + `city` as slug names). The URL still matches the SRS §6
// `/<slug>-overview-<id>` pattern: `params.skill` carries the company
// slug, `params.city` carries the stringified id. Awkward names; renamed
// inside this function to `slug` / `idPart` for clarity downstream.
interface PageProps {
  params: Promise<{ skill: string; city: string }>;
}

async function loadCompany(id: number) {
  return prisma.company.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      logoUrl: true,
      websiteUrl: true,
      averageRating: true,
      reviewCount: true,
      employeeCount: true,
      foundedYear: true,
      industry: { select: { name: true } },
      headquartersCity: { select: { name: true } },
    },
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { skill, city } = await params;
  // Reconstruct the full `<slug>-overview-<id>` segment so the existing
  // parseCompanySlug regex matches. Next 16 split it into two params
  // at the static `-overview-` boundary because the directory name is
  // [skill]-overview-[city] (the shape is forced by Next 16's per-
  // directory slug-name uniqueness rule).
  const parsed = parseCompanySlug(`${skill}-overview-${city}`);
  if (!parsed) return { title: 'Page not found — JobPortal' };
  const company = await loadCompany(parsed.id);
  if (!company) return { title: 'Page not found — JobPortal' };

  const title = `${company.name} — JobPortal`;
  const description =
    company.description?.slice(0, 160) ??
    `${company.name} is hiring. Browse open roles, ratings, and what it's like to work there.`;

  return {
    title,
    description,
    alternates: { canonical: `${SITE}/company/${company.slug}-overview-${company.id}` },
  };
}

export default async function CompanyProfilePage({ params }: PageProps) {
  const { skill, city } = await params;
  // Reconstruct the full `<slug>-overview-<id>` segment so the existing
  // parseCompanySlug regex matches. Next 16 split it into two params
  // at the static `-overview-` boundary because the directory name is
  // [skill]-overview-[city] (the shape is forced by Next 16's per-
  // directory slug-name uniqueness rule).
  const parsed = parseCompanySlug(`${skill}-overview-${city}`);
  if (!parsed) notFound();

  const company = await loadCompany(parsed.id);
  if (!company) notFound();

  // SRS §6.1 + §4.7.5 — slug drift handling. The numeric ID is the permalink;
  // the descriptive slug can change. 308 to the canonical form.
  if (parsed.slug !== company.slug) {
    permanentRedirect(`/company/${company.slug}-overview-${company.id}`);
  }

  const totalActive = await prisma.job.count({
    where: { companyId: company.id, status: 'ACTIVE' },
  });

  const canonicalUrl = `${SITE}/company/${company.slug}-overview-${company.id}`;

  // SRS §4.7.3 — Organization + BreadcrumbList JSON-LD.
  const orgLd = organization({
    name: company.name,
    url: canonicalUrl,
    ...(company.logoUrl ? { logo: company.logoUrl } : {}),
    ...(company.description ? { description: company.description } : {}),
    ...(company.websiteUrl ? { sameAs: [company.websiteUrl] } : {}),
  });
  const bc = breadcrumbList([
    { name: 'Home', url: `${SITE}/` },
    { name: 'Companies', url: `${SITE}/companies` },
    { name: company.name, url: canonicalUrl },
  ]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <JsonLd value={orgLd} />
      <JsonLd value={bc} />

      <article className="space-y-10">
        <CompanyHero
          id={company.id}
          name={company.name}
          logoUrl={company.logoUrl}
          industryName={company.industry?.name ?? null}
          hqCityName={company.headquartersCity?.name ?? null}
          employeeCount={company.employeeCount}
          foundedYear={company.foundedYear}
          websiteUrl={company.websiteUrl}
          averageRating={company.averageRating}
          reviewCount={company.reviewCount}
          workingAtSlug={company.slug}
        />
        <CompanyAbout description={company.description} />
        <CompanyOpenings companyId={company.id} totalActive={totalActive} />
        <CompanyReviews companyId={company.id} />
      </article>
    </main>
  );
}
