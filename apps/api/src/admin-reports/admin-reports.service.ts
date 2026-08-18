import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { prisma, Prisma, type ContentReportStatus } from '@jobportal/db';
import { isFlagEnabled, FLAG } from '@jobportal/feature-flags';
import { JobPublishEffectsService } from '../job-effects/job-publish-effects.service';
import type { UpdateReportInput } from './dto';

export interface ReportDecisionResult {
  id: number;
  status: ContentReportStatus;
  /** True only when this call actually flipped a live posting to CLOSED. */
  jobClosed: boolean;
}

/** The statuses a given action may move a report OUT of. */
function allowedSourceStatuses(action: UpdateReportInput['action']): ContentReportStatus[] {
  // Claiming is only meaningful from OPEN — re-claiming something already being
  // reviewed is a no-op, and claiming a decided report would silently reopen it.
  // The two decisions accept either non-terminal state, because an admin may
  // rule on a report without picking it up first (the common case for an obvious
  // scam posting).
  return action === 'CLAIM' ? ['OPEN'] : ['OPEN', 'REVIEWING'];
}

@Injectable()
export class AdminReportsService {
  private readonly logger = new Logger(AdminReportsService.name);

  constructor(private readonly effects: JobPublishEffectsService) {}

  /**
   * L3, and the non-bypassable one — the console rendering its buttons inert is
   * UX only (CLAUDE.md §4).
   *
   * ⚠ POLARITY. This is a `killswitch.*`, seeded OFF, so `enabled === true`
   * means the feature is DEAD and the throw is on `enabled`. Its sibling
   * `moderation.reports.enabled` — which gates the INTAKE half of this very
   * feature — is a toggle seeded ON whose guard throws on `!enabled`. The two
   * are one keystroke apart and opposite in meaning; reports.service.ts carries
   * the mirror-image warning. A test pins that this reads THIS key and not that
   * one, because a mockResolvedValue(true) stub answers true for every key and
   * would pass either way.
   *
   * Note what is deliberately NOT gated: reading the queue. Staff must still be
   * able to see what users have reported while writes are stopped, the same rule
   * admin-jobs, admin-support and admin-otp-sessions follow.
   */
  private async assertWritesEnabled(): Promise<void> {
    if (await isFlagEnabled(FLAG.KILL_ADMIN_REPORT_WRITE)) {
      throw new ServiceUnavailableException('Report actions are temporarily unavailable');
    }
  }

  /**
   * Claim, uphold or dismiss a content report — optionally taking the reported
   * posting down with it.
   *
   * EVERYTHING that reads state and then acts on it happens inside the
   * transaction, and the report update is a compare-and-swap on the exact status
   * the transaction itself observed. A pre-transaction snapshot would be a
   * read-modify-write across the lock boundary: a concurrent CLAIM moving the row
   * OPEN → REVIEWING between the read and the write still satisfies a
   * `status IN (OPEN, REVIEWING)` guard, so the write would succeed while the
   * audit row recorded `before: OPEN` — a durable record of a transition that
   * never happened. That exact class of bug was found in the billing console's
   * review and is not repeated here.
   */
  async update(
    adminUserId: number,
    reportId: number,
    input: UpdateReportInput,
  ): Promise<ReportDecisionResult> {
    await this.assertWritesEnabled();

    const wantsTakedown = input.action === 'ACTION' && input.closeJob === true;
    const note = input.action === 'CLAIM' ? null : (input.note ?? null);
    const nextStatus: ContentReportStatus =
      input.action === 'CLAIM' ? 'REVIEWING' : input.action === 'ACTION' ? 'ACTIONED' : 'DISMISSED';
    const allowedFrom = allowedSourceStatuses(input.action);

    // ⚠ Prisma interactive-transaction semantics are the load-bearing detail in
    // this block: RETURNING a value COMMITS, only THROWING rolls back. Once the
    // report row has been written, every later refusal must therefore throw —
    // returning a "failed" sentinel would commit the report decision while
    // silently dropping the takedown that was supposed to accompany it, which is
    // the worst possible outcome here (the queue says "handled", the scam
    // posting stays live). Hence the exceptions are raised in place rather than
    // mapped from a result outside.
    const { jobClosed, jobId } = await prisma.$transaction(async (tx) => {
      const current = await tx.contentReport.findUnique({
        where: { id: reportId },
        select: {
          id: true,
          status: true,
          jobId: true,
          // reporterIp and details are deliberately absent: the IP is abuse-triage
          // data no surface may render, and the reporter's free text must never
          // reach a ProfileAuditLog diff (schema.prisma ContentReport.details).
          job: { select: { id: true, status: true, companyId: true } },
        },
      });
      if (!current) throw new NotFoundException('Report not found');

      if (!allowedFrom.includes(current.status)) {
        throw new ConflictException(
          input.action === 'CLAIM'
            ? 'This report has already been picked up or decided. Refresh to see its current state.'
            : 'This report has already been decided. Refresh to see the outcome.',
        );
      }

      // Validated against the in-transaction read, so the check and the guarded
      // UPDATE below agree about what the job's status was.
      if (wantsTakedown) {
        if (current.job == null) {
          throw new ConflictException(
            'This report does not name a job posting, so there is nothing to take down',
          );
        }
        if (current.job.status !== 'ACTIVE') {
          throw new ConflictException(
            'This posting is not live, so there is nothing to take down. Uphold the report without closing it.',
          );
        }
      }

      // Written together, exactly as ContentReport's schema comment requires:
      // a report that leaves OPEN/REVIEWING for a terminal state carries who
      // decided, when, and why. CLAIM is not a terminal state and writes none of
      // them — there is no assignee column in this product, so REVIEWING honestly
      // means "somebody has this", never "X has this".
      const data: Prisma.ContentReportUpdateManyMutationInput =
        input.action === 'CLAIM'
          ? { status: nextStatus }
          : {
              status: nextStatus,
              reviewedAt: new Date(),
              reviewedById: adminUserId,
              resolutionNote: note,
            };

      // Compare-and-swap on the observed status — see the method comment. The
      // guard lives in the WHERE rather than in an `if` above it, so two admins
      // deciding the same report cannot both write.
      const flipped = await tx.contentReport.updateMany({
        where: { id: reportId, status: current.status },
        data,
      });
      if (flipped.count === 0) {
        throw new ConflictException(
          'Another admin changed this report while you were deciding. Refresh and try again.',
        );
      }

      let closed = false;
      if (wantsTakedown && current.job != null) {
        // Same shape as the recruiter's own close(): a status flip, not a delete.
        // Guarded on ACTIVE inside the WHERE so the pre-check above cannot go
        // stale between the two statements.
        //
        // No SERIALIZABLE here, unlike AdminJobsService.remove. That path needs
        // it because `applications: { none: {} }` compiles to a snapshot-evaluated
        // NOT EXISTS that an in-flight apply can slip past, and the delete
        // CASCADES into candidates' application history. This is a plain equality
        // predicate on the row being updated, which the row lock serialises on its
        // own, and nothing here destroys anything.
        const closeResult = await tx.job.updateMany({
          where: { id: current.job.id, status: 'ACTIVE' },
          data: { status: 'CLOSED' },
        });
        if (closeResult.count === 0) {
          // Must THROW, not return — see the note above the transaction.
          throw new ConflictException(
            'This posting stopped being live while you were deciding. Refresh and try again.',
          );
        }
        closed = true;

        await tx.profileAuditLog.create({
          data: {
            userId: adminUserId,
            action: 'JOB_CLOSED_BY_ADMIN',
            // Ids and the transition only — never the job's title, never the
            // reporter's words. `reportId` is what ties this row to the decision
            // committed alongside it.
            diff: {
              jobId: current.job.id,
              companyId: current.job.companyId,
              status: { before: 'ACTIVE', after: 'CLOSED' },
              reportId,
            } as unknown as Prisma.InputJsonValue,
          },
        });
      }

      // CLAIM records no audit row on purpose. The audit trail exists to say
      // which way a moderator RULED; picking a report up is reversible
      // bookkeeping, and there is no CONTENT_REPORT_CLAIMED action precisely
      // because inventing one would imply an assignment this schema cannot store.
      if (input.action !== 'CLAIM') {
        await tx.profileAuditLog.create({
          data: {
            userId: adminUserId,
            action: input.action === 'ACTION' ? 'CONTENT_REPORT_ACTIONED' : 'CONTENT_REPORT_DISMISSED',
            // Report id, the target's ids, the transition and the ADMIN's own
            // note — the exact contract written on the enum members, and never
            // the REPORTER's free-text `details`.
            diff: {
              reportId,
              jobId: current.jobId,
              companyId: current.job?.companyId ?? null,
              status: { before: current.status, after: nextStatus },
              ...(note ? { note } : {}),
              ...(closed ? { jobClosed: true } : {}),
            } as unknown as Prisma.InputJsonValue,
          },
        });
      }

      return { jobClosed: closed, jobId: current.job?.id ?? null };
    });

    this.logger.log(
      `admin=${adminUserId} ${input.action} report=${reportId}${jobClosed ? ` (closed job=${jobId})` : ''}`,
    );

    if (jobClosed && jobId != null) {
      // Re-read AFTER the commit so the row handed to the side effects is the
      // CLOSED one, and because fireRemoveSideEffects needs a full Job — it
      // reads canonicalSlug to build the Cloudflare purge URL.
      //
      // Required, not optional: without it the posting stays in the Elasticsearch
      // index and keeps arriving in job-alert emails after staff have taken it
      // down. The call is void and fire-and-forget by design (the response
      // returns while ES and Cloudflare run), so the log line above is the only
      // operator record if the de-index fails.
      const closedJob = await prisma.job.findUnique({ where: { id: jobId } });
      if (closedJob) {
        this.effects.fireRemoveSideEffects(closedJob);
      } else {
        // The row vanished between the commit and this read — only a concurrent
        // admin hard-delete can do that, and it makes the ES document
        // unreachable through the normal path. Deleting a job fires its own
        // remove side effects, so the index is almost certainly already clean;
        // this is logged rather than silently skipped because it is the one
        // case where nothing else will reconcile it, and the alternative
        // (findUniqueOrThrow) would turn a committed, successful decision into
        // a 500.
        this.logger.warn(
          `report=${reportId} closed job=${jobId} but the row was gone before de-index; ` +
            `verify the job is absent from the Elasticsearch jobs index`,
        );
      }
    }

    return { id: reportId, status: nextStatus, jobClosed };
  }
}
