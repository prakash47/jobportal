import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { prisma } from '@jobportal/db';
import { NotificationsProducerService } from '../recruiter-notifications/notifications-producer.service';

// L3 killswitch for granting NEW collaborator access (SRS §4.9 Collaborate).
// Seeded OFF ⇒ collaboration LIVE; flipping it ON makes add/remove reject with
// 503 (the Job Detail page hides the Collaborate control at L2). Existing
// collaborators keep their access — this gates the grant action, matching the
// job-delete killswitch scope.
const JOB_COLLABORATE_KILLSWITCH_FLAG = 'killswitch.recruiter_job_collaborate';

interface CollaboratorView {
  userId: number;
  name: string;
  image: string | null;
  designation: string | null;
}

@Injectable()
export class RecruiterJobCollaboratorsService {
  private readonly logger = new Logger(RecruiterJobCollaboratorsService.name);

  constructor(private readonly notifications: NotificationsProducerService) {}

  // Owner-strict: only the job's owner manages its collaborators. Returns the
  // job's id + companyId + the owner's name (for the add notification) or 404.
  private async ownedJobOrThrow(
    userId: number,
    jobId: number,
  ): Promise<{ id: number; companyId: number; title: string; ownerName: string }> {
    const job = await prisma.job.findFirst({
      where: { id: jobId, postedById: userId },
      select: {
        id: true,
        companyId: true,
        title: true,
        postedBy: { select: { name: true } },
      },
    });
    if (!job) throw new NotFoundException('Job not found');
    return {
      id: job.id,
      companyId: job.companyId,
      title: job.title,
      ownerName: job.postedBy?.name ?? 'A teammate',
    };
  }

  private async assertCollaborateEnabled(): Promise<void> {
    if (await isFlagEnabled(JOB_COLLABORATE_KILLSWITCH_FLAG)) {
      throw new ServiceUnavailableException('Job collaboration is temporarily unavailable');
    }
  }

  // Owner-only. Returns the current collaborators + the teammates who can still
  // be added (active recruiters in the same company, excluding the owner and any
  // existing collaborator).
  async list(
    userId: number,
    jobId: number,
  ): Promise<{ collaborators: CollaboratorView[]; assignable: CollaboratorView[] }> {
    const job = await this.ownedJobOrThrow(userId, jobId);

    const [rows, teammates] = await Promise.all([
      prisma.jobCollaborator.findMany({
        where: { jobId },
        orderBy: { createdAt: 'asc' },
        select: {
          user: {
            select: { id: true, name: true, image: true, recruiter: { select: { designation: true } } },
          },
        },
      }),
      prisma.recruiter.findMany({
        where: { companyId: job.companyId, deactivatedAt: null, userId: { not: userId } },
        orderBy: { user: { name: 'asc' } },
        select: {
          designation: true,
          user: { select: { id: true, name: true, image: true } },
        },
      }),
    ]);

    const collaborators: CollaboratorView[] = rows.map((r) => ({
      userId: r.user.id,
      name: r.user.name,
      image: r.user.image,
      designation: r.user.recruiter?.designation ?? null,
    }));
    const collaboratorIds = new Set(collaborators.map((c) => c.userId));

    const assignable: CollaboratorView[] = teammates
      .filter((t) => !collaboratorIds.has(t.user.id))
      .map((t) => ({
        userId: t.user.id,
        name: t.user.name,
        image: t.user.image,
        designation: t.designation,
      }));

    return { collaborators, assignable };
  }

  // Owner-only + killswitch-gated. Adds a same-company teammate as a collaborator.
  // Idempotent: re-adding an existing collaborator is a no-op (no duplicate row,
  // no duplicate notification). Fires an in-app notification to the added teammate.
  async add(userId: number, jobId: number, collaboratorUserId: number): Promise<CollaboratorView> {
    await this.assertCollaborateEnabled();
    const job = await this.ownedJobOrThrow(userId, jobId);

    if (collaboratorUserId === userId) {
      throw new BadRequestException('You already own this job.');
    }

    // The candidate must be an ACTIVE recruiter in the SAME company as the job.
    const teammate = await prisma.recruiter.findUnique({
      where: { userId: collaboratorUserId },
      select: {
        companyId: true,
        deactivatedAt: true,
        designation: true,
        user: { select: { id: true, name: true, image: true } },
      },
    });
    if (!teammate || teammate.companyId !== job.companyId || teammate.deactivatedAt !== null) {
      throw new BadRequestException('That teammate cannot be added to this job.');
    }

    const view: CollaboratorView = {
      userId: teammate.user.id,
      name: teammate.user.name,
      image: teammate.user.image,
      designation: teammate.designation,
    };

    const existing = await prisma.jobCollaborator.findUnique({
      where: { jobId_userId: { jobId, userId: collaboratorUserId } },
      select: { id: true },
    });
    if (existing) return view; // already a collaborator — idempotent no-op

    await prisma.jobCollaborator.create({
      data: { jobId, userId: collaboratorUserId, addedById: userId },
    });

    // Fire-and-log: a notification hiccup must not fail the grant.
    this.notifications
      .notifyJobCollaboration({
        recruiterUserId: collaboratorUserId,
        jobId,
        jobTitle: job.title,
        invitedByName: job.ownerName,
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `collaborator notification failed for job ${jobId} → user ${collaboratorUserId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });

    return view;
  }

  // Owner-only + killswitch-gated. Removes a collaborator. Idempotent — removing
  // someone who isn't a collaborator is a successful no-op.
  async remove(userId: number, jobId: number, collaboratorUserId: number): Promise<void> {
    await this.assertCollaborateEnabled();
    await this.ownedJobOrThrow(userId, jobId);
    await prisma.jobCollaborator.deleteMany({ where: { jobId, userId: collaboratorUserId } });
  }
}
