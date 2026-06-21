import type { Metadata } from 'next';
import { prisma } from '@jobportal/db';
import { requireUser } from '../../lib/auth/require-user';
import { OnboardingWizard } from '../../components/onboarding/OnboardingWizard';
import { OnboardingHeader } from '../../components/onboarding/OnboardingHeader';
import { SiteFooter } from '../../components/home/SiteFooter';
import { CLASS12_DEGREE } from '../../components/onboarding/education-constants';

// Authed, dynamic, noindex (like the other private routes).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Set up your profile — Career Queue',
  robots: { index: false, follow: false },
};

// Post-registration onboarding wizard. The seeker is auto-logged-in, so we read
// their current candidate values + the skill/city/industry catalogues + their
// education / projects / languages server-side via Prisma (one SSR round-trip,
// no API hop) and hand them to the client wizard to prefill.
export default async function OnboardingPage() {
  const claims = await requireUser();

  // Ensure the Candidate row exists up front — PATCH /me/skills + POST
  // /me/projects|languages|education do NOT lazily create it (they 404
  // otherwise), and a brand-new account has only the User row.
  const candidate =
    (await prisma.candidate.findUnique({ where: { userId: claims.sub } })) ??
    (await prisma.candidate
      .create({ data: { userId: claims.sub } })
      .catch(() => prisma.candidate.findUniqueOrThrow({ where: { userId: claims.sub } })));

  const [skills, cities, industries, projects, languages, education] = await Promise.all([
    prisma.skill.findMany({ select: { id: true, name: true, category: true }, orderBy: { name: 'asc' } }),
    prisma.city.findMany({ select: { id: true, name: true, state: true }, orderBy: { name: 'asc' } }),
    prisma.industry.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.project.findMany({ where: { candidateId: candidate.id }, orderBy: { createdAt: 'desc' } }),
    prisma.candidateLanguage.findMany({
      where: { candidateId: candidate.id },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.education.findMany({
      where: { candidateId: candidate.id },
      orderBy: [{ startYear: 'desc' }],
    }),
  ]);

  // The structured education form owns two rows, discriminated by the Class 12
  // sentinel degree. pursuing ⇔ endYear is null.
  const class12Row = education.find((e) => e.degree === CLASS12_DEGREE);
  const degreeRow = education.find((e) => e.degree !== CLASS12_DEGREE);
  const currentYear = new Date().getFullYear();

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg-muted)]">
      <OnboardingHeader />
      <OnboardingWizard
        initial={{
        workStatus: candidate.workStatus,
        lookingFor: candidate.lookingFor,
        experienceMonths: candidate.experienceMonths,
        currentSalaryPaise: candidate.currentSalaryPaise,
        currentCompanyName: candidate.currentCompanyName ?? '',
        currentTitle: candidate.currentTitle ?? '',
        currentCityName: candidate.currentCityName ?? '',
        industryId: candidate.industryId,
        noticePeriodDays: candidate.noticePeriodDays,
        skillIds: candidate.skillIds,
        cityIds: candidate.preferredCityIds,
        headline: candidate.headline ?? '',
        expectedSalaryMinPaise: candidate.expectedSalaryMinPaise,
        gender: candidate.gender,
      }}
      education={{
        degree: {
          id: degreeRow?.id ?? null,
          institute: degreeRow?.institute ?? '',
          degree: degreeRow?.degree ?? '',
          fieldOfStudy: degreeRow?.fieldOfStudy ?? '',
          startYear: degreeRow?.startYear != null ? String(degreeRow.startYear) : '',
          endYear: degreeRow?.endYear != null ? String(degreeRow.endYear) : '',
          grade: degreeRow?.grade ?? '',
          pursuing: degreeRow?.endYear === null,
        },
        class12: {
          id: class12Row?.id ?? null,
          institute: class12Row?.institute ?? '',
          degree: '',
          fieldOfStudy: class12Row?.fieldOfStudy ?? '',
          startYear: class12Row?.startYear != null ? String(class12Row.startYear) : '',
          endYear: class12Row?.endYear != null ? String(class12Row.endYear) : '',
          grade: '',
          pursuing: class12Row?.endYear === null,
        },
      }}
      currentYear={currentYear}
      skills={skills.map((s) => ({ id: s.id, label: s.name, sublabel: s.category }))}
      cities={cities}
      industries={industries}
      projects={projects.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        techStack: p.techStack,
        url: p.url,
      }))}
      languages={languages.map((l) => ({ id: l.id, name: l.name, proficiency: l.proficiency }))}
      />
      <SiteFooter />
    </div>
  );
}
