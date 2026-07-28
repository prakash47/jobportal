import { prisma, type JobStatus } from '@jobportal/db';
import type { AccessClaims } from '@jobportal/auth';

// Statuses whose detail page anyone may load. EXPIRED and CLOSED stay readable
// on purpose: they were public, they may be linked from search results, an old
// email or an external site, and the page renders an explanatory notice with a
// disabled apply button. They are already `noindex`.
//
// DRAFT and PENDING_MODERATION are different in kind — they have never been
// public. A PENDING_MODERATION job is one an admin has not yet approved, so
// serving its description, salary band and JobPosting JSON-LD to anyone holding
// the URL would defeat the review gate entirely.
const PUBLICLY_READABLE: readonly JobStatus[] = ['ACTIVE', 'EXPIRED', 'CLOSED'];

export function isPubliclyReadable(status: JobStatus): boolean {
  return PUBLICLY_READABLE.includes(status);
}

// May this viewer load a job that is NOT publicly readable?
//
// Yes for the people who already have a legitimate reason to see it before it
// goes live: the recruiter who posted it (the ⋮ menu's "Preview / View public
// job page" action links straight here and must keep working), the teammates
// they added as collaborators, and platform admins — who need to open the very
// page they are being asked to approve.
//
// Everyone else gets the same notFound() an unknown id gets, so the response is
// indistinguishable from "no such job" and does not confirm the posting exists.
export async function canPreviewUnpublishedJob(
  user: AccessClaims | null,
  job: { postedById: number | null },
): Promise<boolean> {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (job.postedById != null && job.postedById === user.sub) return true;
  return false;
}

// Collaborator check, split out because it costs a query and is only reachable
// once the cheap owner/admin checks above have failed.
export async function isJobCollaborator(userId: number, jobId: number): Promise<boolean> {
  const row = await prisma.jobCollaborator.findUnique({
    where: { jobId_userId: { jobId, userId } },
    select: { jobId: true },
  });
  return row !== null;
}

// The full decision, in cost order: public status → no query at all; owner or
// admin → no query; otherwise one indexed lookup on the collaborator table.
export async function canViewJob(
  user: AccessClaims | null,
  job: { id: number; status: JobStatus; postedById: number | null },
): Promise<boolean> {
  if (isPubliclyReadable(job.status)) return true;
  if (await canPreviewUnpublishedJob(user, job)) return true;
  if (!user) return false;
  return isJobCollaborator(user.sub, job.id);
}
