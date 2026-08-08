import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { prisma } from '@jobportal/db';
import { Breadcrumbs, Container } from '@jobportal/ui';
import {
  CompanyAbout,
  CompanyHighlights,
  CompanyHiringRail,
  CompanyOpenings,
  CompanyProfileHero,
  CompanyQuickFacts,
  CompanyReviews,
  RelatedCompanies,
  parseHighlightSections,
  type RelatedCompany,
} from '../../../components/companies';
import { CompanyProfileNav, type CompanyNavItem } from '../../../components/companies/CompanyProfileNav';
import { SiteShell } from '../../../components/shell/SiteShell';
import { JsonLd } from '../../../lib/seo';
import { breadcrumbList, organization } from '../../../lib/seo/json-ld';
import { parseCompanySlug } from '@jobportal/domain/slug';

const SITE = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

// SRS §4.7.2 — company profile is SSR. Wrapping the page in SiteShell (shared
// header + footer) resolves signed-in state server-side via cookies, so this
// route renders dynamically and cannot use ISR `revalidate` — the same
// trade-off /companies and /job/[slug] already took for consistent chrome.
// Structured data (Organization + BreadcrumbList JSON-LD) + the self-canonical
// still render server-side, so SEO is unaffected.

interface PageProps {
  params: Promise<{ handle: string }>;
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
      companyType: true,
      workingAtSections: true,
      averageRating: true,
      reviewCount: true,
      employeeCount: true,
      foundedYear: true,
      industryId: true,
      industry: { select: { name: true } },
      headquartersCity: { select: { name: true } },
      kyc: { select: { status: true } },
    },
  });
}

// Same-industry peers (most-reviewed first, deterministic id tiebreak) + each
// peer's live-role count via one bounded groupBy. Resolved here once and reused
// by every RelatedCompanies instance across breakpoints.
async function loadRelatedCompanies(
  companyId: number,
  industryId: number | null,
): Promise<RelatedCompany[]> {
  if (industryId === null) return [];
  const peers = await prisma.company.findMany({
    where: { industryId, id: { not: companyId } },
    orderBy: [{ reviewCount: 'desc' }, { averageRating: 'desc' }, { id: 'asc' }],
    take: 5,
    select: { id: true, slug: true, name: true, logoUrl: true, averageRating: true },
  });
  if (peers.length === 0) return [];

  const counts = await prisma.job.groupBy({
    by: ['companyId'],
    where: { companyId: { in: peers.map((p) => p.id) }, status: 'ACTIVE' },
    _count: { _all: true },
  });
  const openByCompany = new Map(counts.map((c) => [c.companyId, c._count._all]));

  return peers.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    logoUrl: p.logoUrl,
    averageRating: p.averageRating,
    openRoles: openByCompany.get(p.id) ?? 0,
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  const parsed = parseCompanySlug(handle);
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
  const { handle } = await params;
  const parsed = parseCompanySlug(handle);
  if (!parsed) notFound();

  const company = await loadCompany(parsed.id);
  if (!company) notFound();

  // SRS §6.1 + §4.7.5 — slug drift handling. The numeric ID is the permalink;
  // the descriptive slug can change. 308 to the canonical form.
  if (parsed.slug !== company.slug) {
    permanentRedirect(`/company/${company.slug}-overview-${company.id}`);
  }

  const [totalActive, related] = await Promise.all([
    prisma.job.count({ where: { companyId: company.id, status: 'ACTIVE' } }),
    loadRelatedCompanies(company.id, company.industryId),
  ]);

  const canonicalUrl = `${SITE}/company/${company.slug}-overview-${company.id}`;
  const industryName = company.industry?.name ?? null;
  const hqCityName = company.headquartersCity?.name ?? null;
  const isVerified = company.kyc?.status === 'VERIFIED';
  const highlights = parseHighlightSections(company.workingAtSections);

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

  // The in-page nav only lists sections that render as a single instance in
  // the hero/main column (so anchor ids stay unique). Related companies is a
  // discovery rail duplicated across breakpoints, so it is intentionally not a
  // scroll-spy target.
  const navItems: CompanyNavItem[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'about', label: 'About' },
    ...(highlights.length > 0 ? [{ id: 'highlights', label: 'Highlights' }] : []),
    { id: 'openings', label: 'Open positions' },
    { id: 'reviews', label: 'Reviews' },
  ];

  const quickFacts = (
    <CompanyQuickFacts
      industryName={industryName}
      companyType={company.companyType}
      foundedYear={company.foundedYear}
      employeeCount={company.employeeCount}
      hqCityName={hqCityName}
      websiteUrl={company.websiteUrl}
    />
  );
  const hiringRail = <CompanyHiringRail companyName={company.name} activeJobs={totalActive} />;
  const relatedRail = <RelatedCompanies peers={related} industryName={industryName} />;

  return (
    <SiteShell>
      <JsonLd value={orgLd} />
      <JsonLd value={bc} />

      <Container size="lg" className="py-6 lg:py-8">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: 'Home', href: '/' },
            { label: 'Companies', href: '/companies' },
            { label: company.name },
          ]}
        />

        <CompanyProfileHero
          id={company.id}
          name={company.name}
          logoUrl={company.logoUrl}
          industryName={industryName}
          companyType={company.companyType}
          hqCityName={hqCityName}
          employeeCount={company.employeeCount}
          foundedYear={company.foundedYear}
          websiteUrl={company.websiteUrl}
          averageRating={company.averageRating}
          reviewCount={company.reviewCount}
          activeJobs={totalActive}
          isVerified={isVerified}
          canonicalUrl={canonicalUrl}
          workingAtSlug={company.slug}
        />

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_300px]">
          {/* Left rail — sticky in-page nav + quick facts (desktop). */}
          <div className="hidden lg:block">
            <div className="space-y-4 lg:sticky lg:top-20">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
                <CompanyProfileNav items={navItems} />
              </div>
              {quickFacts}
            </div>
          </div>

          {/* Main column. Quick facts + hiring + related fold inline below the
              breakpoint where their sidebar is hidden (pure components, so
              rendering the sidebar copy too is free; the related query is
              resolved once and shared). */}
          <div className="min-w-0 space-y-6">
            <div className="lg:hidden">{quickFacts}</div>
            <CompanyAbout description={company.description} />
            <CompanyHighlights sections={highlights} />
            <div className="xl:hidden">{hiringRail}</div>
            <CompanyOpenings companyId={company.id} totalActive={totalActive} />
            <CompanyReviews
              companyId={company.id}
              averageRating={company.averageRating}
              reviewCount={company.reviewCount}
            />
            <div className="xl:hidden">{relatedRail}</div>
          </div>

          {/* Right rail — sticky hiring snapshot + peers (wide desktop). */}
          <aside className="hidden xl:block" aria-label="Hiring and similar companies">
            <div className="space-y-4 xl:sticky xl:top-20">
              {hiringRail}
              {relatedRail}
            </div>
          </aside>
        </div>
      </Container>
    </SiteShell>
  );
}
