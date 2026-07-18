import { Prisma } from '@jobportal/db';

/**
 * Prisma where-clause matching a job the given user may **manage or respond to**
 * (SRS §4.9 Job Detail → Collaborate): the OWNER (`Job.postedById`) OR a listed
 * collaborator (`JobCollaborator`). `userId` is the User id (JWT `sub`).
 *
 * Used by the read/manage/respond paths shared across services (recruiter-jobs
 * getOne/update/close/reopen; recruiter-applicants list/transition/notes/resume).
 * Destructive/make-live actions (delete, publish) and managing collaborators
 * themselves stay OWNER-ONLY and must NOT use this — check `postedById` directly.
 */
export function jobManageableWhere(userId: number): Prisma.JobWhereInput {
  return { OR: [{ postedById: userId }, { collaborators: { some: { userId } } }] };
}
