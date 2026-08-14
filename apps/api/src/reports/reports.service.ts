import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { isFlagEnabled, FLAG } from '@jobportal/feature-flags';
import { isPubliclyReadable } from '@jobportal/domain';
import { prisma } from '@jobportal/db';
import type { CreateReportInput } from './dto';

// Intake for user-submitted content reports. The console that works the queue
// lives in apps/sadmin over admin-reports; this module only creates rows.

@Injectable()
export class ReportsService {
  // L3, and the LAST line of defence — apps/web hiding the Report control is
  // UX only (CLAUDE.md §4).
  //
  // NOTE THE POLARITY. Every other flag gate in apps/api is a `killswitch.*`,
  // seeded OFF, where enabled === "the feature is dead". This one is a feature
  // toggle seeded ON, so the throw is on `!enabled`. Copying a killswitch guard
  // here verbatim would silently invert it and disable reporting for everyone.
  private async assertReportingEnabled(): Promise<void> {
    if (!(await isFlagEnabled(FLAG.MODERATION_REPORTS))) {
      throw new ServiceUnavailableException('Reporting is temporarily unavailable');
    }
  }

  // `reporterId` is the signed-in user's id, or null for an anonymous report —
  // OptionalJwtAuthGuard never rejects, so both reach here. `reporterIp` is
  // stored for abuse triage only and is never returned by any endpoint.
  async create(
    input: CreateReportInput,
    reporterId: number | null,
    reporterIp: string | null,
  ): Promise<{ id: number }> {
    await this.assertReportingEnabled();

    // Only one target type exists today; the switch is what will fail to compile
    // when a second is added, rather than silently filing it with a null FK.
    if (input.targetType !== 'JOB') {
      throw new NotFoundException('Unknown report target');
    }
    const jobId = input.jobId as number; // guaranteed by CreateReportDto's refine

    // You may only report content you could actually see. This reuses the SHARED
    // rule rather than restating it, so the report surface cannot drift from the
    // page: DRAFT and PENDING_MODERATION jobs have never been public, and
    // answering anything but 404 for one would confirm a posting exists to
    // someone holding a guessed id — the same leak canViewJob was written to
    // close. EXPIRED and CLOSED stay reportable: they are still readable, and a
    // scam posting does not stop being worth flagging when it closes.
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, status: true },
    });
    if (!job || !isPubliclyReadable(job.status)) {
      throw new NotFoundException('Job not found');
    }

    // One open report per person per job. Postgres cannot express this as a
    // partial unique index through Prisma, so it is service-enforced — the same
    // place RecruiterInvite and KycDocument enforce their own invariants.
    //
    // Deliberately scoped to signed-in reporters: an anonymous duplicate has no
    // stable identity to key on (reporterIp is shared by whole offices and
    // rotates on mobile networks), so blocking on it would silently swallow
    // genuine reports. Anonymous flooding is what the 5/min throttle is for.
    //
    // Only OPEN and REVIEWING count. Once a report is ACTIONED or DISMISSED the
    // same person may report the same job again — the content may have been
    // edited since, and a decided report is a closed record, not a permanent ban
    // on complaining.
    if (reporterId != null) {
      const existing = await prisma.contentReport.findFirst({
        where: { jobId, reporterId, status: { in: ['OPEN', 'REVIEWING'] } },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('You have already reported this job');
      }
    }

    const created = await prisma.contentReport.create({
      data: {
        targetType: 'JOB',
        jobId,
        reason: input.reason,
        // exactOptionalPropertyTypes: an explicit `undefined` is not assignable
        // to these optional Prisma inputs, so the nulls are written explicitly.
        details: input.details ?? null,
        reporterId,
        reporterIp,
      },
      select: { id: true },
    });

    // Only the id. The response deliberately echoes nothing back — not the
    // reason, not the details, not the job — so this endpoint can never become a
    // way to read report state anonymously.
    return { id: created.id };
  }
}
