import { prisma } from '@jobportal/db';
import { readUserFromCookie } from '../../../lib/auth/server-session';
import { PageHeader } from '../../../components/dashboard/PageHeader';
import { ContentCard } from '../../../components/dashboard/ContentCard';
import { EducationOnboardingForm } from '../../../components/profile/EducationOnboardingForm';
import { CLASS12_DEGREE } from '../../../components/onboarding/education-constants';

export default async function EducationPage() {
  const session = (await readUserFromCookie())!;

  // Race-safe lazy create so the section's POST /me/education always has a
  // candidate to attach to (mirrors the dashboard home / details pages).
  const candidate =
    (await prisma.candidate.findUnique({ where: { userId: session.sub }, select: { id: true } })) ??
    (await prisma.candidate
      .create({ data: { userId: session.sub }, select: { id: true } })
      .catch(() =>
        prisma.candidate.findUniqueOrThrow({ where: { userId: session.sub }, select: { id: true } }),
      ));

  const educations = await prisma.education.findMany({
    where: { candidateId: candidate.id },
    orderBy: [{ startYear: 'desc' }],
  });

  // Same discriminator the onboarding form uses: the Class 12 row is tagged with
  // the CLASS12_DEGREE sentinel; the first other row is the "first degree".
  const class12Row = educations.find((e) => e.degree === CLASS12_DEGREE);
  const degreeRow = educations.find((e) => e.degree !== CLASS12_DEGREE);
  const currentYear = new Date().getFullYear();

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Education" description="Add your most recent degree and Class 12." />

      <ContentCard className="p-5 sm:p-6">
        <EducationOnboardingForm
          currentYear={currentYear}
          degree={{
            id: degreeRow?.id ?? null,
            institute: degreeRow?.institute ?? '',
            degree: degreeRow?.degree ?? '',
            fieldOfStudy: degreeRow?.fieldOfStudy ?? '',
            startYear: degreeRow?.startYear != null ? String(degreeRow.startYear) : '',
            endYear: degreeRow?.endYear != null ? String(degreeRow.endYear) : '',
            grade: degreeRow?.grade ?? '',
            pursuing: degreeRow?.endYear === null,
          }}
          class12={{
            id: class12Row?.id ?? null,
            institute: class12Row?.institute ?? '',
            degree: '',
            fieldOfStudy: class12Row?.fieldOfStudy ?? '',
            startYear: class12Row?.startYear != null ? String(class12Row.startYear) : '',
            endYear: class12Row?.endYear != null ? String(class12Row.endYear) : '',
            grade: '',
            pursuing: class12Row?.endYear === null,
          }}
        />
      </ContentCard>
    </div>
  );
}
