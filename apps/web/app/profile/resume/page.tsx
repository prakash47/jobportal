import { prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { readUserFromCookie } from '../../../lib/auth/server-session';
import { PageHeader } from '../../../components/dashboard/PageHeader';
import { ContentCard } from '../../../components/dashboard/ContentCard';
import { ResumeManager } from '../../../components/profile/ResumeManager';

const RESUME_DOWNLOAD_FLAG = 'feature.resume_download_pdf';

export default async function ResumePage() {
  const session = (await readUserFromCookie())!;
  const candidate = await prisma.candidate.findUnique({
    where: { userId: session.sub },
    include: { activeResume: true },
  });

  // Three-layer flag enforcement (CLAUDE.md §4): server check before render.
  // Middleware handles the route-level redirect; the API guard is the third
  // line of defence inside ResumeService.getDownloadUrl.
  const downloadEnabled = await isFlagEnabled(RESUME_DOWNLOAD_FLAG, { userId: session.sub });

  const active =
    candidate?.activeResume && candidate.activeResume.deletedAt === null
      ? {
          id: candidate.activeResume.id,
          originalFilename: candidate.activeResume.originalFilename,
          sizeBytes: candidate.activeResume.sizeBytes,
          mimeType: candidate.activeResume.mimeType,
          scanStatus: candidate.activeResume.scanStatus,
          uploadedAt: candidate.activeResume.uploadedAt.toISOString(),
        }
      : null;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Resume"
        description="PDF or DOCX, up to 5 MB. Recruiters can view your resume after you apply to their jobs."
      />
      <ContentCard className="p-5 sm:p-6">
        <ResumeManager active={active} downloadEnabled={downloadEnabled} />
      </ContentCard>
    </div>
  );
}
