import { prisma } from '@jobportal/db';
import { requireUser } from '../../../lib/auth/require-user';
import { PageHeader } from '../../../components/dashboard/PageHeader';
import { ContentCard } from '../../../components/dashboard/ContentCard';
import { ResumeManager, type ResumeVersion } from '../../../components/profile/ResumeManager';

export default async function ResumePage() {
  const session = await requireUser();
  const candidate = await prisma.candidate.findUnique({
    where: { userId: session.sub },
    select: { id: true, activeResumeId: true },
  });

  // Every version the candidate still holds, not only the active one — uploading
  // used to retire the previous file, so version history did not exist.
  const rows = candidate
    ? await prisma.resume.findMany({
        where: { candidateId: candidate.id, deletedAt: null },
        orderBy: { uploadedAt: 'desc' },
      })
    : [];

  const versions: ResumeVersion[] = rows.map((r) => ({
    id: r.id,
    originalFilename: r.originalFilename,
    sizeBytes: r.sizeBytes,
    mimeType: r.mimeType,
    scanStatus: r.scanStatus,
    uploadedAt: r.uploadedAt.toISOString(),
    isActive: r.id === candidate?.activeResumeId,
  }));

  return (
    <div className="max-w-3xl space-y-6">
      {/*
        The "Recruiters can view your resume after you apply to their jobs."
        line was removed on the owner's instruction. The upload card states the
        formats and the size cap, which is what the user needs at the moment of
        uploading; the recruiter-visibility point is repeated at the moment it
        actually applies, in the removal confirmation.
      */}
      <PageHeader title="Resume" description="The document recruiters receive when you apply." />
      <ContentCard className="p-5 sm:p-6">
        <ResumeManager versions={versions} />
      </ContentCard>
    </div>
  );
}
