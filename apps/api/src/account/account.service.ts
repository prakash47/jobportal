import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { prisma } from '@jobportal/db';
import { StorageService } from '../storage/storage.service';

/**
 * Permanent account deletion (ADR 0002 decision 8).
 *
 * Apple and Google both reject an app that lets a user create an account but
 * not delete it, regardless of feature parity — so this is a launch blocker for
 * the mobile client, not a nice-to-have.
 *
 * WHY THIS IS NOT JUST `prisma.user.delete()`
 *
 * Almost every User relation is already `onDelete: Cascade`, so the row graph
 * does take care of itself. Two things do not:
 *
 * 1. **Stored objects.** A database cascade cannot reach Cloudflare R2. Deleting
 *    only the rows would leave every CV the candidate ever uploaded sitting in
 *    the bucket with nothing pointing at it — an account that reports itself
 *    deleted while the most sensitive document it held survives. The keys are
 *    only knowable from the rows, so they must be collected BEFORE the delete.
 * 2. **Ordering.** `ResumeService.delete` deliberately RETAINS an object that an
 *    application still references (ADR 0002 decision 7), so recruiters keep the
 *    document they were sent. That reasoning does not survive account deletion:
 *    the applications are going too, so there is no longer anyone to preserve it
 *    for, and retention here would just be an orphan.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(private readonly storage: StorageService) {}

  /**
   * Delete the caller's account and everything that belongs to it.
   *
   * Scoped to CANDIDATE deliberately. A recruiter is not merely a user: they may
   * be the sole OWNER of a company, their jobs survive them via
   * `Job.postedById onDelete: SetNull`, and the Super Admin console already has
   * a "no account holder" state for employers whose recruiters have gone. Silently
   * turning a company into that state from a self-service endpoint is a worse
   * outcome than an explicit refusal, so recruiters and admins are told to go
   * through support. The store requirement is about the app's own users, who are
   * candidates.
   */
  async deleteOwnAccount(userId: number): Promise<{ deleted: true }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        candidate: { select: { id: true } },
      },
    });
    if (!user) throw new NotFoundException('Account not found');

    if (user.role !== 'CANDIDATE') {
      throw new ForbiddenException(
        'Recruiter and admin accounts cannot be deleted from here. Contact support.',
      );
    }

    // Collect the storage keys FIRST — after the delete they are unknowable.
    // Every resume the candidate ever uploaded, not just the active one: the
    // superseded and soft-deleted rows have objects behind them too, and those
    // are exactly the ones a naive "delete the active CV" pass would miss.
    const resumeKeys = user.candidate
      ? (
          await prisma.resume.findMany({
            where: { candidateId: user.candidate.id },
            select: { r2Key: true },
          })
        ).map((r) => r.r2Key)
      : [];

    // The row graph goes in one statement; the cascades handle Candidate,
    // Resume, Application, SavedJob, JobAlert, Session, the candidate's own
    // Notification rows, audit rows and the rest.
    //
    // WHAT DELIBERATELY SURVIVES, stated precisely rather than as "everything
    // is gone", because two things are not:
    //
    // - `CompanyReview.userId` is SetNull, so a review detaches from its author
    //   instead of vanishing from the company's page. The row has no name or
    //   email column; what remains is the reviewer's own prose, which is the
    //   published content itself.
    // - A recruiter's `Notification` row belongs to the RECRUITER, so it is not
    //   cascaded, and its body was rendered at write time as
    //   "<candidate name> applied to <job>". The name therefore survives
    //   verbatim in the recruiter's feed. That is the same reasoning as the
    //   resume snapshot: it is a record of something that actually happened and
    //   was already delivered to that recruiter. It is NOT full erasure, and
    //   anyone extending this to a formal erasure request needs to scrub it.
    //
    // `SupportContactMessage` also holds a name and email behind a SetNull
    // userId, but only `recruiter-support` writes it, and recruiters cannot
    // reach this endpoint — so a deleted candidate can never have one.
    await prisma.user.delete({ where: { id: userId } });

    // Storage last, and best-effort. The account is already gone by this point,
    // so a bucket hiccup must not resurrect it or fail the request.
    //
    // Be honest about the trade this ordering makes: a crash here leaves
    // objects with NO rows — CVs in the bucket that nothing points at, which is
    // the privacy problem, and it is unrecoverable through the app because the
    // keys died with the rows. That is why the failure is logged with the key
    // and the user id: the log line is the only remaining way to find them.
    //
    // It is still the right order. Deleting objects first would mean a crash
    // leaves a live account whose CV has silently vanished — a user who can log
    // in and finds their data corrupted, with no signal that anything happened.
    // A loud orphan someone can sweep beats silent corruption of a live account.
    let orphaned = 0;
    for (const key of resumeKeys) {
      try {
        await this.storage.deleteObject(key);
      } catch (err) {
        orphaned += 1;
        this.logger.error(
          `account ${userId} deleted but resume object ${key} remains: ${(err as Error).message}`,
        );
      }
    }
    if (orphaned === 0 && resumeKeys.length > 0) {
      this.logger.log(`account ${userId} deleted with ${resumeKeys.length} resume object(s)`);
    }

    return { deleted: true };
  }
}
