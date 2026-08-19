import { Injectable, Logger } from '@nestjs/common';
import { prisma, Prisma, type Broadcast } from '@jobportal/db';
import { FLAG, isFlagEnabled } from '@jobportal/feature-flags';
import { ResendClient } from '../email/resend-client';
import { renderBroadcast } from '../email/templates/broadcast';
import { frozenCounts, tallyRecipients } from './broadcast-counts';
import { broadcastEmailWhere, broadcastInAppWhere } from './broadcast-segment';

/**
 * The two job kinds on the `broadcasts` queue.
 *
 * `plan` resolves the segment once and writes the complete recipient ledger
 * before a single email leaves. `deliver` is ONE JOB PER RECIPIENT, which is a
 * deliberate departure from the batch-per-job shape that would be the obvious
 * choice:
 *
 *  - BullMQ's `limiter` throttles JOBS, not work inside a job. A batch job
 *    sending 200 emails in a loop is completely unthrottled from the queue's
 *    point of view, and Resend's default allowance is about 2 requests/second.
 *  - `attempts`/`backoff` and the DLQ then apply PER RECIPIENT. In a batch job a
 *    single bad address fails the whole batch, and BullMQ's retry re-runs the
 *    199 addresses that already succeeded.
 *
 * The cost is one Redis entry and two indexed reads per recipient, which at the
 * rate limiter's pace is not the bottleneck by any margin.
 */
export type BroadcastJob =
  | { kind: 'plan'; broadcastId: number }
  | { kind: 'deliver'; broadcastId: number; recipientId: number };

/** Users read per page when resolving a segment. */
const PLAN_PAGE_SIZE = 500;

/** Rows per `createMany` / `addBulk` call. */
const INSERT_CHUNK = 500;

@Injectable()
export class BroadcastsProcessor {
  private readonly logger = new Logger(BroadcastsProcessor.name);

  constructor(private readonly resend: ResendClient) {}

  /**
   * Enqueue callback, injected by the queue service.
   *
   * The processor does not import the queue service: the queue service owns the
   * processor, so a mutual import would be a Nest circular dependency. This is
   * set once at queue construction and is what lets `plan` fan out.
   */
  private enqueueMany: ((jobs: BroadcastJob[]) => Promise<void>) | null = null;

  setEnqueue(fn: (jobs: BroadcastJob[]) => Promise<void>): void {
    this.enqueueMany = fn;
  }

  async handle(job: BroadcastJob): Promise<void> {
    if (job.kind === 'plan') {
      await this.plan(job.broadcastId);
      return;
    }
    await this.deliver(job.broadcastId, job.recipientId);
  }

  /**
   * Emergency stop, re-read on EVERY job rather than once at dispatch.
   *
   * This is the property that distinguishes the broadcast killswitch from every
   * other admin killswitch in the repo: those gate a request that completes and
   * returns, so checking once is checking at the only moment that matters. A
   * broadcast keeps causing effects for minutes after its request returned, so a
   * switch that were only read at dispatch would be unable to stop the very
   * situation it exists for.
   *
   * `killswitch.transactional_emails` is honoured too. A broadcast worker that
   * calls Resend directly would otherwise escape the global email stop exactly
   * the way `sendJobAlert` already does — a carve-out worth not repeating on the
   * highest-volume sender in the product.
   */
  private async isHalted(): Promise<boolean> {
    const [broadcastKilled, emailKilled] = await Promise.all([
      isFlagEnabled(FLAG.KILL_ADMIN_BROADCAST_SEND),
      isFlagEnabled('killswitch.transactional_emails'),
    ]);
    return broadcastKilled || emailKilled;
  }

  /**
   * A halt is recorded as a CANCELLATION, not as a pause.
   *
   * There is no resume in v1, so leaving the broadcast SENDING with thousands of
   * PENDING rows would be a state nothing can ever move out of — the console
   * would show a send that appears to be in progress forever. Marking it
   * cancelled is the honest reading: those recipients were not written to and
   * will not be. The PENDING rows are deliberately LEFT PENDING rather than
   * marked skipped, so the ledger shows exactly how far the send got.
   *
   * No audit row is written. `ProfileAuditLog` is keyed by an acting admin's
   * User id and there is no acting admin here — the operator's act was toggling
   * the flag, which `FlagAuditLog` already records with their id and reason.
   */
  private async haltAsCancelled(broadcastId: number): Promise<void> {
    // The ledger is rolled up in the SAME statement that cancels. Without this
    // the frozen columns stay at zero — `finalize()` is the only other writer
    // and it requires status SENDING, which this transition has just left — so
    // the console log would report "0 sent" for a broadcast that had already
    // mailed thousands of people before the switch was thrown.
    const counts = await tallyRecipients(prisma, broadcastId);
    const halted = await prisma.broadcast.updateMany({
      where: { id: broadcastId, status: 'SENDING' },
      data: { status: 'CANCELLED', cancelledAt: new Date(), ...frozenCounts(counts) },
    });
    if (halted.count > 0) {
      this.logger.warn(
        `broadcast=${broadcastId} halted by killswitch after ${counts.sent} sent — ${counts.pending} recipients left unsent`,
      );
    }
  }

  /**
   * Resolve the segment and write the recipient ledger.
   *
   * Runs exactly once per broadcast in the happy path, but is written to be safe
   * to re-run: `createMany({ skipDuplicates: true })` against
   * `@@unique([broadcastId, userId])` makes a repeat pass a no-op, and the
   * delivery jobs it enqueues carry deterministic job ids. That matters because
   * `app.enableShutdownHooks()` is never called in this repo, so a deploy during
   * planning kills the job mid-pass and BullMQ re-runs it from the start.
   */
  private async plan(broadcastId: number): Promise<void> {
    const broadcast = await prisma.broadcast.findUnique({ where: { id: broadcastId } });
    if (!broadcast) {
      this.logger.warn(`plan: broadcast=${broadcastId} no longer exists`);
      return;
    }
    // Cancelled between dispatch and the worker picking the job up.
    if (broadcast.status !== 'SENDING') {
      this.logger.log(`plan: broadcast=${broadcastId} is ${broadcast.status} — nothing to do`);
      return;
    }
    if (await this.isHalted()) {
      await this.haltAsCancelled(broadcastId);
      return;
    }

    // The ADDRESSED SET — the people this broadcast is for.
    //
    // Email is the fallible channel with a per-recipient outcome, so when it is
    // on it defines the ledger. An in-app-only broadcast is addressed to the
    // in-app audience instead, which for ALL_USERS is the recruiter subset
    // rather than everyone: writing candidate rows for a channel that cannot
    // reach them would inflate the count an admin reads as "people reached".
    const addressedWhere = broadcast.emailEnabled
      ? broadcastEmailWhere(broadcast.segment)
      : broadcastInAppWhere(broadcast.segment);
    if (!addressedWhere) {
      // Structurally unreachable — the DTO rejects in-app to a candidate-only
      // segment, and a broadcast with neither channel. Fail loudly rather than
      // silently marking a broadcast SENT that reached nobody.
      throw new Error(`broadcast=${broadcastId} resolves to no deliverable audience`);
    }

    let written = 0;
    let cursor: number | undefined;
    for (;;) {
      const users: { id: number; email: string }[] = await prisma.user.findMany({
        where: addressedWhere,
        select: { id: true, email: true },
        orderBy: { id: 'asc' },
        take: PLAN_PAGE_SIZE,
        ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
      });
      if (users.length === 0) break;

      const rows: Prisma.BroadcastRecipientCreateManyInput[] = users.map((u) => ({
        broadcastId,
        userId: u.id,
        email: u.email,
      }));
      const inserted = await prisma.broadcastRecipient.createMany({
        data: rows,
        skipDuplicates: true,
      });
      written += inserted.count;

      const last = users[users.length - 1];
      if (!last) break;
      cursor = last.id;
      if (users.length < PLAN_PAGE_SIZE) break;
    }

    // The count is read back rather than trusted from `written`, because
    // skipDuplicates makes `written` the number of rows THIS pass inserted — on
    // a re-run after a mid-plan restart that is a fraction of the real total.
    const recipientCount = await prisma.broadcastRecipient.count({ where: { broadcastId } });
    await prisma.broadcast.update({ where: { id: broadcastId }, data: { recipientCount } });

    if (broadcast.inAppEnabled) {
      await this.writeInAppRows(broadcast);
    }

    if (!broadcast.emailEnabled) {
      // In-app only: delivery already happened above, synchronously and
      // atomically per chunk, so there is no per-recipient outcome to track.
      await prisma.broadcastRecipient.updateMany({
        where: { broadcastId, status: 'PENDING' },
        data: { status: 'SENT', sentAt: new Date() },
      });
      await this.finalize(broadcastId);
      return;
    }

    const pending = await prisma.broadcastRecipient.findMany({
      where: { broadcastId, status: 'PENDING' },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    if (pending.length === 0) {
      await this.finalize(broadcastId);
      return;
    }

    const enqueue = this.enqueueMany;
    if (!enqueue) throw new Error('broadcast queue is not wired — cannot fan out');
    for (let i = 0; i < pending.length; i += INSERT_CHUNK) {
      const slice = pending.slice(i, i + INSERT_CHUNK);
      await enqueue(
        slice.map((r) => ({ kind: 'deliver' as const, broadcastId, recipientId: r.id })),
      );
    }
    this.logger.log(`broadcast=${broadcastId} planned — ${pending.length} recipients enqueued`);
  }

  /**
   * Write the in-app bell rows.
   *
   * ⚠ Recruiters only, always. `apps/web` has no bell, no feed and no read of
   * the Notification table, so a candidate row would be written and rendered
   * nowhere — see broadcast-segment.ts. The audience is resolved from the
   * segment rather than from the ledger for that reason: on an ALL_USERS
   * broadcast the ledger holds candidates too.
   *
   * `linkUrl` is null even when the broadcast has a CTA. `Notification.linkUrl`
   * is a recruiter-portal-RELATIVE path handed straight to `router.push`, while
   * `ctaUrl` is a validated absolute https URL for the email — pushing an
   * absolute URL into the router would produce a broken in-portal navigation.
   */
  private async writeInAppRows(broadcast: Broadcast): Promise<void> {
    const where = broadcastInAppWhere(broadcast.segment);
    if (!where) return;

    // The bell shows title + body only, so the body is truncated to something
    // that reads as a notification rather than as a pasted newsletter. The full
    // text is in the email and on the console's detail page.
    const body = broadcast.body.trim();
    const preview = body.length > 300 ? `${body.slice(0, 299)}…` : body;

    let cursor: number | undefined;
    for (;;) {
      const users: { id: number }[] = await prisma.user.findMany({
        where,
        select: { id: true },
        orderBy: { id: 'asc' },
        take: PLAN_PAGE_SIZE,
        ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
      });
      if (users.length === 0) break;

      // ⚠ `broadcastId` + `skipDuplicates` are what make this pass RE-RUNNABLE,
      // and they are not optional decoration. `plan` carries `attempts: 3` and
      // is re-run by BullMQ after a throw anywhere later in the method — and
      // after a deploy kills it mid-pass, which is the normal case here because
      // `app.enableShutdownHooks()` is never called in this repo. Before the
      // unique key existed this was the ONE write in the planner with no
      // collision key, so a single retry put the same announcement in every
      // recruiter's bell twice, and three attempts made it three times.
      //
      // The email ledger got this right via BroadcastRecipient's own unique key;
      // the bell rows were the gap.
      await prisma.notification.createMany({
        data: users.map((u) => ({
          userId: u.id,
          broadcastId: broadcast.id,
          type: 'PLATFORM_ANNOUNCEMENT' as const,
          title: broadcast.subject,
          body: preview,
        })),
        skipDuplicates: true,
      });

      const last = users[users.length - 1];
      if (!last) break;
      cursor = last.id;
      if (users.length < PLAN_PAGE_SIZE) break;
    }
  }

  /**
   * Send to one recipient.
   *
   * ⚠ ORDERING IS DELIBERATE: send first, mark second. The alternative — claim
   * the row, then send — is at-most-once, and a crash between the claim and the
   * send loses that email with no trace. This way a crash in the same window
   * re-sends ONE email on the retry. For an operational notice ("we are down
   * tonight") a duplicate is a minor annoyance and a silent miss is the actual
   * failure, so at-least-once is the right side to err on. The blast radius of a
   * crash is one recipient either way, never the segment.
   *
   * The `status: 'PENDING'` predicate on the write is what makes a re-run of an
   * already-completed job a no-op rather than a second email.
   */
  private async deliver(broadcastId: number, recipientId: number): Promise<void> {
    const recipient = await prisma.broadcastRecipient.findUnique({ where: { id: recipientId } });
    if (!recipient || recipient.status !== 'PENDING') return;

    const broadcast = await prisma.broadcast.findUnique({ where: { id: broadcastId } });
    if (!broadcast) return;
    if (broadcast.status !== 'SENDING') return;

    if (await this.isHalted()) {
      await this.haltAsCancelled(broadcastId);
      return;
    }

    // Re-read the account. A large send spans minutes and an account can be
    // deleted inside that window; `userId` is a loose id with no FK precisely so
    // the ledger survives that, which means the ledger alone cannot tell us
    // whether the person is still here.
    const user = await prisma.user.findUnique({
      where: { id: recipient.userId },
      select: { id: true },
    });
    if (!user) {
      await prisma.broadcastRecipient.updateMany({
        where: { id: recipientId, status: 'PENDING' },
        data: { status: 'SKIPPED', statusReason: 'Account no longer exists' },
      });
      await this.finalizeIfDone(broadcastId);
      return;
    }

    const rendered = renderBroadcast({
      subject: broadcast.subject,
      body: broadcast.body,
      ...(broadcast.ctaLabel && broadcast.ctaUrl
        ? { cta: { label: broadcast.ctaLabel, url: broadcast.ctaUrl } }
        : {}),
    });

    try {
      await this.resend.send({
        to: recipient.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
    } catch (err) {
      // Rethrown so BullMQ applies the retry policy and, on exhaustion, the
      // failed listener records it. The row stays PENDING between attempts,
      // which is what makes the retry actually re-send rather than skip.
      await prisma.broadcastRecipient.update({
        where: { id: recipientId },
        data: { statusReason: (err as Error).message.slice(0, 500) },
      });
      throw err;
    }

    await prisma.broadcastRecipient.updateMany({
      where: { id: recipientId, status: 'PENDING' },
      data: { status: 'SENT', sentAt: new Date(), statusReason: null },
    });
    await this.finalizeIfDone(broadcastId);
  }

  /** Terminal failure for one recipient, called by the queue's `failed` listener. */
  async recordTerminalFailure(
    broadcastId: number,
    recipientId: number,
    message: string,
  ): Promise<void> {
    await prisma.broadcastRecipient.updateMany({
      where: { id: recipientId, status: 'PENDING' },
      data: { status: 'FAILED', statusReason: message.slice(0, 500) },
    });
    await this.finalizeIfDone(broadcastId);
  }

  private async finalizeIfDone(broadcastId: number): Promise<void> {
    const stillPending = await prisma.broadcastRecipient.count({
      where: { broadcastId, status: 'PENDING' },
    });
    if (stillPending > 0) return;
    await this.finalize(broadcastId);
  }

  /**
   * Roll the ledger up onto the broadcast row and close it out.
   *
   * FAILED (the broadcast status) means the send never landed anywhere — every
   * recipient failed, or there were none. A partial delivery is SENT and carries
   * its counts, because "sent, 12 of 4,000 addresses bounced" and "this never
   * went out" are different facts and an admin needs to be able to tell them
   * apart at a glance.
   */
  private async finalize(broadcastId: number): Promise<void> {
    const counts = await tallyRecipients(prisma, broadcastId);
    const anyDelivered = counts.sent > 0;

    await prisma.broadcast.updateMany({
      where: { id: broadcastId, status: 'SENDING' },
      data: {
        status: anyDelivered ? 'SENT' : 'FAILED',
        ...frozenCounts(counts),
      },
    });
    this.logger.log(
      `broadcast=${broadcastId} finalized — sent=${counts.sent} skipped=${counts.skipped} failed=${counts.failed}`,
    );
  }
}
