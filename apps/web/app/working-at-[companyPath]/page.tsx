import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { prisma } from '@jobportal/db';
import { Button } from '@jobportal/ui';
import { CompanyHero } from '../../components/companies';
import { JsonLd } from '../../lib/seo';
import { breadcrumbList } from '../../lib/seo/json-ld';
import { parseWorkingAtSlug } from '../../lib/url/slug';

const SITE = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

// SRS §4.7.6 — working-at content is SSR with edge cache. Same revalidate
// policy as the profile page; the content is CMS-managed (admin tool lands
// with Task 16) so we don't bust the cache often.
export const revalidate = 3600;

interface PageProps {
  params: Promise<{ companyPath: string }>;
}

interface WorkingAtSection {
  heading: string;
  body: string;
  imageUrl?: string;
}

function isSectionArray(v: unknown): v is WorkingAtSection[] {
  return (
    Array.isArray(v) &&
    v.every(
      (s) =>
        typeof s === 'object' &&
        s !== null &&
        typeof (s as Record<string, unknown>)['heading'] === 'string' &&
        typeof (s as Record<string, unknown>)['body'] === 'string',
    )
  );
}

async function loadCompany(id: number) {
  return prisma.company.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      name: true,
      logoUrl: true,
      websiteUrl: true,
      employeeCount: true,
      foundedYear: true,
      averageRating: true,
      reviewCount: true,
      workingAtSections: true,
      industry: { select: { name: true } },
      headquartersCity: { select: { name: true } },
    },
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { companyPath } = await params;
  const parsed = parseWorkingAtSlug(`working-at-${companyPath}`);
  if (!parsed) return { title: 'Page not found — JobPortal' };
  const company = await loadCompany(parsed.id);
  if (!company) return { title: 'Page not found — JobPortal' };

  return {
    title: `Working at ${company.name} — JobPortal`,
    description: `What it's like to work at ${company.name}. Culture, benefits, team and openings.`,
    alternates: {
      canonical: `${SITE}/working-at-${company.slug}-${company.id}`,
    },
  };
}

export default async function WorkingAtPage({ params }: PageProps) {
  const { companyPath } = await params;
  // The route folder strips the literal `working-at-` prefix; reconstruct the
  // full string before handing to the existing parser so the regex stays the
  // single source of truth.
  const parsed = parseWorkingAtSlug(`working-at-${companyPath}`);
  if (!parsed) notFound();

  const company = await loadCompany(parsed.id);
  if (!company) notFound();

  if (parsed.slug !== company.slug) {
    permanentRedirect(`/working-at-${company.slug}-${company.id}`);
  }

  const sections = isSectionArray(company.workingAtSections) ? company.workingAtSections : [];

  const canonicalUrl = `${SITE}/working-at-${company.slug}-${company.id}`;
  const profileUrl = `${SITE}/company/${company.slug}-overview-${company.id}`;
  const bc = breadcrumbList([
    { name: 'Home', url: `${SITE}/` },
    { name: 'Companies', url: `${SITE}/companies` },
    { name: company.name, url: profileUrl },
    { name: 'Working at', url: canonicalUrl },
  ]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
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
          // We're already on the working-at page; suppress the redundant link.
          workingAtSlug={null}
        />

        {sections.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--color-border)] p-10 text-center">
            <p className="text-sm font-medium text-[var(--color-fg)]">
              {company.name} hasn&rsquo;t shared their story yet.
            </p>
            <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
              In the meantime, browse open roles or read reviews on the company page.
            </p>
            <Button asChild variant="secondary" className="mt-4">
              <Link href={`/company/${company.slug}-overview-${company.id}`}>Visit company page</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-10">
            {sections.map((s, i) => (
              <section key={i} className="space-y-3">
                <h2 className="text-lg font-semibold text-[var(--color-fg)]">{s.heading}</h2>
                <p className="whitespace-pre-line text-[15px] leading-relaxed text-[var(--color-fg)]">
                  {s.body}
                </p>
                {s.imageUrl && (
                  <Image
                    src={s.imageUrl}
                    alt=""
                    width={1024}
                    height={576}
                    className="rounded-lg border border-[var(--color-border)]"
                  />
                )}
              </section>
            ))}
          </div>
        )}

        <div className="border-t border-[var(--color-border)] pt-6">
          <Link
            href={`/company/${company.slug}-overview-${company.id}`}
            className="inline-flex items-center text-sm font-medium text-[var(--color-primary-600)] hover:underline"
          >
            ← Back to {company.name}
          </Link>
        </div>
      </article>
    </main>
  );
}
