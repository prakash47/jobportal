import { prisma } from '@jobportal/db';
import { requireUser } from '../../../lib/auth/require-user';
import { PageHeader } from '../../../components/dashboard/PageHeader';
import { ContentCard } from '../../../components/dashboard/ContentCard';
import { EducationManager } from '../../../components/profile/EducationManager';
import { CLASS12_DEGREE } from '../../../components/onboarding/education-constants';
import { emptyEduDraft, type EduDraft } from '../../../lib/profile/education';

interface EducationRow {
  id: number;
  institute: string;
  degree: string;
  fieldOfStudy: string | null;
  startYear: number;
  endYear: number | null;
  grade: string | null;
}

function toDraft(row: EducationRow, keepDegreeName: boolean): EduDraft {
  return {
    id: row.id,
    institute: row.institute,
    // The Class 12 row stores a sentinel in `degree`; showing it back would
    // put "Class XII" into a field the user never typed it into.
    degree: keepDegreeName ? row.degree : '',
    fieldOfStudy: row.fieldOfStudy ?? '',
    startYear: String(row.startYear),
    endYear: row.endYear !== null ? String(row.endYear) : '',
    grade: row.grade ?? '',
    pursuing: row.endYear === null,
  };
}

export default async function EducationPage() {
  const session = await requireUser();

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
    orderBy: [{ startYear: 'desc' }, { id: 'desc' }],
  });

  // Same discriminator the onboarding wizard uses: the Class 12 row is tagged
  // with the CLASS12_DEGREE sentinel. Everything else is a qualification —
  // previously only the FIRST of them was reachable, which is the reported bug.
  const class12Row = educations.find((e) => e.degree === CLASS12_DEGREE);
  const qualificationRows = educations.filter((e) => e.degree !== CLASS12_DEGREE);

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Education"
        description="Add every qualification you hold — degrees, diplomas and Class 12."
      />

      <ContentCard className="p-5 sm:p-6">
        <EducationManager
          currentYear={new Date().getFullYear()}
          qualifications={qualificationRows.map((r) => toDraft(r, true))}
          class12={class12Row ? toDraft(class12Row, false) : emptyEduDraft}
        />
      </ContentCard>
    </div>
  );
}
