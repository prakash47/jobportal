import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { prisma, Prisma, type Broadcast } from '@jobportal/db';
import { FLAG, isFlagEnabled } from '@jobportal/feature-flags';
// Prisma's `contains` compiles to an UNESCAPED LIKE, so an un-escaped `?q=%`
// matches every row — a bug this repo has shipped twice. Imported from
// @jobportal/domain rather than given a third definition.
import { escapeLikePattern } from '@jobportal/domain/txn-log-params';
import { ResendClient } from '../email/resend-client';
import { renderBroadcast } from '../email/templates/broadcast';
import { frozenCounts, tallyRecipients } from './broadcast-counts';
import { broadcastEmailWhere, broadcastInAppWhere } from './broadcast-segment';
import { BroadcastsQueueService } from './broadcasts.queue';
import type {
  CreateBroadcastInput,
  ListBroadcastsQueryInput,
  PreviewCountInput,
  UpdateBroadcastInput,
} from './dto';

const PAGE_SIZE = 20;

/**
 * Rows shown on the detail page's problem list.
 *
 * Only SKIPPED and FAILED are listed. A successful send has thousands of
 * identical SENT rows and listing them would bury the handful that need
 * attention — the ledger's counts already answer "how many", and the rows worth
 * reading one at a time are the ones that did not arrive.
 */
const PROBLEM_ROW_LIMIT = 100;

@Injectable()
export class AdminBroadcastsService {
  private readonly logger = new Logger(AdminBroadcastsService.name);

  constructor(
    private readonly queue: BroadcastsQueueService,
    private readonly resend: ResendClient,
  ) {}

  /**
   * Layer 3 for the dispatch action (non-bypassable).
   *
   * ⚠ Polarity: `killswitch.*` throws when the flag is ENABLED. A feature toggle
   * like `moderation.reports.enabled` throws on `!enabled` — the two shapes are
   * one keystroke apart and reports.service.ts documents a near-miss.
   *
   * Gates SENDING only. Composing, listing and reading a past broadcast keep
   * working, matching the rule admin-jobs, admin-support, admin-reports and
   * admin-transactions already follow: killing a dangerous verb must not blind
   * staff to what has already happened.
   */
  private async assertSendEnabled(): Promise<void> {
    if (await isFlagEnabled(FLAG.KILL_ADMIN_BROADCAST_SEND)) {
      throw new ServiceUnavailableException('Sending broadcasts is temporarily unavailable');
    }
  }

  async list(query: ListBroadcastsQueryInput) {
    const page = query.page ?? 1;
    const where: Prisma.BroadcastWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.q) {
      // Subject only. The body is a long announcement and full-text over it
      // would surface a broadcast because a common word appears buried in a
      // paragraph, which is noise rather than a match — the same call
      // admin-support makes for ticket descriptions.
      where.subject = { contains: escapeLikePattern(query.q), mode: 'insensitive' };
    }

    const [total, rows] = await Promise.all([
      prisma.broadcast.count({ where }),
      prisma.broadcast.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          subject: true,
          category: true,
          segment: true,
          status: true,
          emailEnabled: true,
          inAppEnabled: true,
          recipientCount: true,
          sentCount: true,
          skippedCount: true,
          failedCount: true,
          createdAt: true,
          sentAt: true,
        },
      }),
    ]);

    // ⚠ The delivery figures come from the LEDGER, not from the frozen columns
    // on the row, and that is load-bearing rather than tidy. Those columns are
    // written when a broadcast closes out, so a send still IN FLIGHT carries
    // zeros — the log would report "0 sent" for a broadcast that was at that
    // moment mailing thousands of people, which is indistinguishable on screen
    // from a send that reached nobody. One extra groupBy over
    // `@@index([broadcastId, status])` for the twenty ids on the page buys a
    // column that is true at every point in a broadcast's life.
    const ids = rows.map((r) => r.id);
    const grouped =
      ids.length === 0
        ? []
        : await prisma.broadcastRecipient.groupBy({
            by: ['broadcastId', 'status'],
            where: { broadcastId: { in: ids } },
            _count: { _all: true },
          });
    const liveCountOf = (broadcastId: number, status: string): number =>
      grouped.find((g) => g.broadcastId === broadcastId && g.status === status)?._count._all ?? 0;

    return {
      items: rows.map((r) => ({
        ...r,
        sentCount: liveCountOf(r.id, 'SENT'),
        skippedCount: liveCountOf(r.id, 'SKIPPED'),
        failedCount: liveCountOf(r.id, 'FAILED'),
        pendingCount: liveCountOf(r.id, 'PENDING'),
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
  }

  async getDetail(id: number) {
    const broadcast = await prisma.broadcast.findUnique({ where: { id } });
    if (!broadcast) throw new NotFoundException('Broadcast not found');

    const [author, problems, progress] = await Promise.all([
      this.resolveAuthor(broadcast.createdById),
      prisma.broadcastRecipient.findMany({
        where: { broadcastId: id, status: { in: ['SKIPPED', 'FAILED'] } },
        orderBy: { id: 'asc' },
        take: PROBLEM_ROW_LIMIT,
        select: { id: true, email: true, status: true, statusReason: true },
      }),
      // The same tally the worker and cancel() write from, so the detail screen
      // and the frozen columns can never describe different arithmetic.
      tallyRecipients(prisma, id),
    ]);

    return {
      ...broadcast,
      author,
      // Live counts from the ledger rather than the rolled-up columns, so a
      // broadcast that is still SENDING shows real progress. The columns on the
      // row are the frozen record written when it closes out; these are the
      // truth right now, and while a send is in flight the two legitimately
      // differ.
      progress,
      problems,
      problemsTruncated: problems.length === PROBLEM_ROW_LIMIT,
    };
  }

  /**
   * How many people a segment currently resolves to.
   *
   * ⚠ An ESTIMATE by construction, and the console labels it as one. The segment
   * is a live query, so a count taken while composing is already stale when Send
   * is pressed — someone signs up, a recruiter is deactivated. What makes it an
   * honest estimate rather than a decorative one is that it runs the SAME
   * predicate the planner runs (broadcast-segment.ts), so it can only drift by
   * real membership changes, never by the two disagreeing about what the segment
   * means.
   */
  async previewCount(input: PreviewCountInput) {
    const inAppWhere = broadcastInAppWhere(input.segment);
    const [emailRecipients, inAppRecipients] = await Promise.all([
      prisma.user.count({ where: broadcastEmailWhere(input.segment) }),
      inAppWhere ? prisma.user.count({ where: inAppWhere }) : Promise.resolve(0),
    ]);
    return { segment: input.segment, emailRecipients, inAppRecipients };
  }

  async create(adminUserId: number, input: CreateBroadcastInput) {
    const broadcast = await prisma.broadcast.create({
      data: {
        subject: input.subject,
        body: input.body,
        category: input.category,
        segment: input.segment,
        emailEnabled: input.emailEnabled,
        inAppEnabled: input.inAppEnabled,
        // Spread rather than an explicit undefined: exactOptionalPropertyTypes
        // makes `ctaLabel: undefined` a type error, and Prisma reads a missing
        // key as "leave alone" where an explicit null means "clear".
        ...(input.ctaLabel ? { ctaLabel: input.ctaLabel } : {}),
        ...(input.ctaUrl ? { ctaUrl: input.ctaUrl } : {}),
        createdById: adminUserId,
      },
    });
    // No audit row. Creating a draft changes nothing anyone can see and reaches
    // nobody; the audit table records levers that were PULLED, and a draft is
    // the row itself. BROADCAST_SENT is where attribution matters.
    return broadcast;
  }

  /**
   * Edit a draft.
   *
   * Replaces the whole content rather than patching, so "did the message change"
   * is answerable — which is what lets `testSentAt` be cleared. A test send
   * attests that a human read THE MESSAGE THAT IS ABOUT TO GO OUT; if the
   * subject can change while that attestation survives, the rail is decorative.
   */
  async update(id: number, input: UpdateBroadcastInput) {
    const existing = await prisma.broadcast.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Broadcast not found');
    if (existing.status !== 'DRAFT') {
      throw new ConflictException('Only a draft can be edited');
    }

    const changed =
      existing.subject !== input.subject ||
      existing.body !== input.body ||
      existing.category !== input.category ||
      existing.segment !== input.segment ||
      existing.emailEnabled !== input.emailEnabled ||
      existing.inAppEnabled !== input.inAppEnabled ||
      (existing.ctaLabel ?? null) !== (input.ctaLabel ?? null) ||
      (existing.ctaUrl ?? null) !== (input.ctaUrl ?? null);

    // ⚠ CONDITIONAL, like send() and cancel(). The status check above read one
    // row and this writes another moment later; an unconditional
    // `update({ where: { id } })` would happily land an edit on a broadcast that
    // had been claimed for dispatch in between — rewriting the segment and body
    // of a send already fanning out to the whole platform, with the worker
    // reading the new values for every recipient it had not yet reached.
    const claimed = await prisma.broadcast.updateMany({
      where: { id, status: 'DRAFT' },
      data: {
        subject: input.subject,
        body: input.body,
        category: input.category,
        segment: input.segment,
        emailEnabled: input.emailEnabled,
        inAppEnabled: input.inAppEnabled,
        ctaLabel: input.ctaLabel ?? null,
        ctaUrl: input.ctaUrl ?? null,
        ...(changed ? { testSentAt: null } : {}),
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException('This broadcast changed state — reload and try again');
    }

    const updated = await prisma.broadcast.findUnique({ where: { id } });
    if (!updated) throw new NotFoundException('Broadcast not found');
    return updated;
  }

  /**
   * Send the composed message to the acting admin's own address.
   *
   * Deliberately NOT gated by `killswitch.admin_broadcast_send`. That switch
   * exists to stop a message reaching the platform; this reaches exactly one
   * staff inbox, and it is the rail that makes a real send safe — an operator
   * who has paused sending is precisely the person who needs to be able to check
   * a draft renders correctly before re-enabling it.
   *
   * The address is read from the DATABASE, not from the JWT claim. A token
   * issued before an email change still carries the old address, and a test send
   * that lands somewhere the admin no longer controls proves nothing while
   * looking like it proved everything.
   */
  async testSend(adminUserId: number, id: number) {
    const broadcast = await prisma.broadcast.findUnique({ where: { id } });
    if (!broadcast) throw new NotFoundException('Broadcast not found');
    if (broadcast.status !== 'DRAFT') {
      throw new ConflictException('Only a draft can be test-sent');
    }

    const admin = await prisma.user.findUnique({
      where: { id: adminUserId },
      select: { email: true },
    });
    if (!admin) throw new NotFoundException('Admin account not found');

    const rendered = renderBroadcast({
      subject: broadcast.subject,
      body: broadcast.body,
      ...(broadcast.ctaLabel && broadcast.ctaUrl
        ? { cta: { label: broadcast.ctaLabel, url: broadcast.ctaUrl } }
        : {}),
    });

    await this.resend.send({
      to: admin.email,
      // Prefixed so a test copy can never be mistaken for the real announcement
      // sitting in the same inbox — staff are recipients of their own product.
      subject: `[TEST] ${rendered.subject}`,
      html: rendered.html,
      text: rendered.text,
    });

    // Stamped only after Resend accepted it. Setting it first would let a failed
    // test satisfy the send precondition, which is the one thing this column is
    // for.
    //
    // ⚠ And stamped CONDITIONALLY on the draft not having moved underneath. A
    // Resend call takes hundreds of milliseconds, and an edit committed inside
    // that window clears `testSentAt` — an unconditional stamp landing
    // afterwards would re-arm the precondition for content that was never
    // test-sent, which is precisely the state the whole rail exists to prevent.
    // `updatedAt` is the right predicate because Prisma's `@updatedAt` bumps on
    // every write to this row, so any edit at all invalidates the claim.
    const stamped = await prisma.broadcast.updateMany({
      where: { id, status: 'DRAFT', updatedAt: broadcast.updatedAt },
      data: { testSentAt: new Date() },
    });
    if (stamped.count === 0) {
      throw new ConflictException(
        'The draft changed while the test was being sent, so it has not been marked as tested. Send yourself another test copy.',
      );
    }

    const updated = await prisma.broadcast.findUnique({ where: { id } });
    if (!updated) throw new NotFoundException('Broadcast not found');
    this.logger.log(`admin=${adminUserId} test-sent broadcast=${id} to ${admin.email}`);
    return { ...updated, sentTo: admin.email };
  }

  /**
   * Dispatch.
   *
   * The irreversible one. Every guard below refuses a request that would
   * otherwise do something the admin cannot take back:
   *
   *  1. **Killswitch** (L3) — the operator's emergency stop.
   *  2. **PROMOTIONAL is refused.** The consent rails do not exist:
   *     `EmailPreference.productNewsEnabled` gates nothing today, recruiters have
   *     no surface anywhere to set it, and there is no token unsubscribe or
   *     List-Unsubscribe header. Sending marketing under those conditions would
   *     mail people who explicitly switched "Product news" off in a UI that
   *     promises it works.
   *  3. **Only a DRAFT can be sent**, which is also the double-submit guard —
   *     see the conditional transition below.
   *  4. **A test send must have happened**, and must attest to THIS content.
   *  5. **An empty segment is refused.** "Sent to 0 people" is indistinguishable
   *     on screen from a broken send, and it is nearly always a mis-picked
   *     segment.
   *
   * ⚠ NO ADVISORY LOCK, deliberately, and that is not an oversight — the invoice
   * numberer next door uses one. It needs one because it READS a maximum and
   * then WRITES a value derived from it, a race a single statement cannot close.
   * Here the guard is one conditional UPDATE (`WHERE id = ? AND status =
   * 'DRAFT'`), which Postgres already serialises: of two admins pressing Send at
   * the same instant, exactly one gets `count === 1` and the other gets 0 and a
   * 409. Adding a lock around a primitive that is already atomic would only add
   * a way to deadlock.
   */
  async send(adminUserId: number, id: number) {
    await this.assertSendEnabled();

    const broadcast = await prisma.broadcast.findUnique({ where: { id } });
    if (!broadcast) throw new NotFoundException('Broadcast not found');

    if (broadcast.category === 'PROMOTIONAL') {
      throw new BadRequestException(
        'Promotional broadcasts cannot be sent yet: marketing consent is not enforced anywhere, recruiters have no way to opt out, and there is no unsubscribe link. Send this as an operational notice, or wait for the consent rails.',
      );
    }
    if (broadcast.status !== 'DRAFT') {
      throw new ConflictException(`This broadcast is already ${broadcast.status.toLowerCase()}`);
    }
    if (broadcast.testSentAt == null) {
      throw new BadRequestException(
        'Send yourself a test copy first. If the message has been edited since the last test, test it again.',
      );
    }

    const estimatedRecipients = await this.countAddressed(broadcast);
    if (estimatedRecipients === 0) {
      throw new BadRequestException(
        'This segment currently has no recipients, so there is nothing to send.',
      );
    }

    const dispatchedAt = new Date();
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.broadcast.updateMany({
        where: { id, status: 'DRAFT' },
        data: { status: 'SENDING', sentAt: dispatchedAt },
      });
      if (claimed.count === 0) {
        // Someone else won the race between the read above and this write.
        throw new ConflictException('This broadcast has already been sent');
      }
      await tx.profileAuditLog.create({
        data: {
          userId: adminUserId,
          action: 'BROADCAST_SENT',
          // Ids, shape and counts only — never the subject or body. Those are
          // admin-authored and would arguably be permitted, but they already
          // live on the Broadcast row this points at, and copying the full text
          // of every platform-wide message into the audit table would duplicate
          // the module's bulkiest free text into the one table this repo keeps
          // body-free. The RECIPIENT LIST is likewise a count, the same shape
          // BILLING_TRANSACTIONS_EXPORTED uses.
          diff: {
            broadcastId: id,
            category: broadcast.category,
            segment: broadcast.segment,
            channels: { email: broadcast.emailEnabled, inApp: broadcast.inAppEnabled },
            // Named an estimate because it is one: it is the count at the moment
            // of dispatch, and the ledger written by the planner is what
            // actually got a row.
            estimatedRecipients,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    });

    try {
      await this.queue.enqueuePlan(id);
    } catch (err) {
      // The status is already SENDING and the audit row is already committed, so
      // a failed enqueue would otherwise leave a broadcast that claims to be
      // sending and never will — with the admin told it worked. Roll back to
      // DRAFT so it can simply be sent again once Redis is back.
      //
      // The audit row is deliberately NOT deleted. It records that an admin
      // pulled the lever, which they did; audit rows are not rewritten because
      // the attempt failed.
      await prisma.broadcast.updateMany({
        where: { id, status: 'SENDING' },
        data: { status: 'DRAFT', sentAt: null },
      });
      this.logger.error(`broadcast=${id} dispatch failed to enqueue: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'Could not start the send — the job queue is unavailable. Nothing was sent; try again.',
      );
    }

    this.logger.log(
      `admin=${adminUserId} dispatched broadcast=${id} segment=${broadcast.segment} recipients~${estimatedRecipients}`,
    );
    return this.getDetail(id);
  }

  /**
   * Stop a broadcast.
   *
   * From DRAFT this is simply abandoning it. From SENDING it is a genuine stop:
   * the worker re-reads the status before every recipient, so remaining jobs
   * become no-ops. It CANNOT un-send what has already gone — the response and
   * the console both report how far it got rather than implying a clean undo.
   */
  async cancel(adminUserId: number, id: number) {
    const broadcast = await prisma.broadcast.findUnique({ where: { id } });
    if (!broadcast) throw new NotFoundException('Broadcast not found');
    if (broadcast.status !== 'DRAFT' && broadcast.status !== 'SENDING') {
      throw new ConflictException(
        `A ${broadcast.status.toLowerCase()} broadcast cannot be cancelled`,
      );
    }

    const previousStatus = broadcast.status;
    await prisma.$transaction(async (tx) => {
      // The ledger is rolled up in the SAME statement that cancels, because
      // `finalize()` — the only other writer of these columns — requires status
      // SENDING and this transition has just left it. Without this a stopped
      // send reads "0 sent" in the console log forever, however much mail had
      // already gone out, which is the most misleading thing this feature could
      // say to someone auditing what left the building.
      const counts = await tallyRecipients(tx, id);
      const claimed = await tx.broadcast.updateMany({
        where: { id, status: previousStatus },
        data: { status: 'CANCELLED', cancelledAt: new Date(), ...frozenCounts(counts) },
      });
      if (claimed.count === 0) {
        throw new ConflictException('This broadcast changed state — reload and try again');
      }
      await tx.profileAuditLog.create({
        data: {
          userId: adminUserId,
          action: 'BROADCAST_CANCELLED',
          diff: {
            broadcastId: id,
            status: { before: previousStatus, after: 'CANCELLED' },
            // How much had already left, so the audit row records what the
            // cancellation could and could not take back. Read from the same
            // tally the columns above were written from, so the audit row and
            // the broadcast row cannot disagree about one instant.
            alreadySentCount: counts.sent,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    });

    this.logger.log(`admin=${adminUserId} cancelled broadcast=${id} (was ${previousStatus})`);
    return this.getDetail(id);
  }

  /** The size of the addressed set — the same predicate the planner will use. */
  private countAddressed(broadcast: Broadcast): Promise<number> {
    const where = broadcast.emailEnabled
      ? broadcastEmailWhere(broadcast.segment)
      : broadcastInAppWhere(broadcast.segment);
    if (!where) return Promise.resolve(0);
    return prisma.user.count({ where });
  }

  /**
   * The admin who composed it.
   *
   * `createdById` is a loose id with no FK, so it can outlive the account. An id
   * that no longer resolves returns null and the console renders "Unknown
   * admin", which is the point of storing it loosely — the record of what was
   * said to the whole platform should not vanish with a staff departure.
   */
  private async resolveAuthor(
    createdById: number | null,
  ): Promise<{ id: number; name: string; email: string } | null> {
    if (createdById == null) return null;
    const user = await prisma.user.findUnique({
      where: { id: createdById },
      select: { id: true, name: true, email: true },
    });
    return user ?? null;
  }
}
