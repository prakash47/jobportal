import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    broadcast: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    broadcastRecipient: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      groupBy: vi.fn(),
    },
    notification: { createMany: vi.fn() },
    user: { findMany: vi.fn(), findUnique: vi.fn() },
  },
  Prisma: {},
}));

vi.mock('@jobportal/feature-flags', () => ({
  FLAG: { KILL_ADMIN_BROADCAST_SEND: 'killswitch.admin_broadcast_send' },
  isFlagEnabled: vi.fn(),
}));

import { prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { BroadcastsProcessor } from './broadcasts.processor';

type Mock = ReturnType<typeof vi.fn>;
const m = prisma as unknown as {
  broadcast: { findUnique: Mock; update: Mock; updateMany: Mock };
  broadcastRecipient: {
    findUnique: Mock;
    findMany: Mock;
    count: Mock;
    createMany: Mock;
    update: Mock;
    updateMany: Mock;
    groupBy: Mock;
  };
  notification: { createMany: Mock };
  user: { findMany: Mock; findUnique: Mock };
};
const flag = isFlagEnabled as unknown as Mock;

const resend = { send: vi.fn() };

function broadcast(over: Record<string, unknown> = {}) {
  return {
    id: 7,
    subject: 'Scheduled maintenance',
    body: 'Line one.\n\nLine two.',
    category: 'OPERATIONAL',
    segment: 'ALL_RECRUITERS',
    emailEnabled: true,
    inAppEnabled: false,
    ctaLabel: null,
    ctaUrl: null,
    status: 'SENDING',
    ...over,
  };
}

describe('BroadcastsProcessor', () => {
  let processor: BroadcastsProcessor;
  const enqueue = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    flag.mockResolvedValue(false);
    m.broadcast.updateMany.mockResolvedValue({ count: 1 });
    m.broadcast.update.mockResolvedValue({});
    m.broadcastRecipient.updateMany.mockResolvedValue({ count: 1 });
    m.broadcastRecipient.update.mockResolvedValue({});
    m.broadcastRecipient.createMany.mockResolvedValue({ count: 0 });
    m.broadcastRecipient.count.mockResolvedValue(0);
    m.broadcastRecipient.findMany.mockResolvedValue([]);
    m.broadcastRecipient.groupBy.mockResolvedValue([]);
    m.notification.createMany.mockResolvedValue({ count: 0 });
    m.user.findMany.mockResolvedValue([]);
    resend.send.mockResolvedValue(undefined);
    enqueue.mockResolvedValue(undefined);
    processor = new BroadcastsProcessor(resend as unknown as never);
    processor.setEnqueue(enqueue);
  });

  // --- deliver -------------------------------------------------------------

  describe('deliver', () => {
    function pendingRecipient(over: Record<string, unknown> = {}) {
      return { id: 31, broadcastId: 7, userId: 99, email: 'r@acme.test', status: 'PENDING', ...over };
    }

    it('SENDS FIRST, then marks — at-least-once, not at-most-once', async () => {
      // Ordering is the whole design decision here. Claim-then-send would be
      // at-most-once: a crash between the claim and the send loses that email
      // with no trace. This way the same crash re-sends ONE email on retry. For
      // an operational notice a duplicate is an annoyance and a silent miss is
      // the real failure.
      const order: string[] = [];
      resend.send.mockImplementation(async () => {
        order.push('send');
      });
      m.broadcastRecipient.updateMany.mockImplementation(async () => {
        order.push('mark');
        return { count: 1 };
      });
      m.broadcastRecipient.findUnique.mockResolvedValue(pendingRecipient());
      m.broadcast.findUnique.mockResolvedValue(broadcast());
      m.user.findUnique.mockResolvedValue({ id: 99 });

      await processor.handle({ kind: 'deliver', broadcastId: 7, recipientId: 31 });
      expect(order).toEqual(['send', 'mark']);
    });

    it('marks SENT only while the row is still PENDING', async () => {
      // The predicate is what makes a re-run of an already-completed job a
      // no-op rather than a second email.
      m.broadcastRecipient.findUnique.mockResolvedValue(pendingRecipient());
      m.broadcast.findUnique.mockResolvedValue(broadcast());
      m.user.findUnique.mockResolvedValue({ id: 99 });

      await processor.handle({ kind: 'deliver', broadcastId: 7, recipientId: 31 });
      expect(m.broadcastRecipient.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 31, status: 'PENDING' } }),
      );
    });

    it('does nothing at all for a row that is no longer PENDING', async () => {
      m.broadcastRecipient.findUnique.mockResolvedValue(pendingRecipient({ status: 'SENT' }));
      await processor.handle({ kind: 'deliver', broadcastId: 7, recipientId: 31 });
      expect(resend.send).not.toHaveBeenCalled();
    });

    it('stops when the broadcast has been cancelled mid-flight', async () => {
      m.broadcastRecipient.findUnique.mockResolvedValue(pendingRecipient());
      m.broadcast.findUnique.mockResolvedValue(broadcast({ status: 'CANCELLED' }));
      await processor.handle({ kind: 'deliver', broadcastId: 7, recipientId: 31 });
      expect(resend.send).not.toHaveBeenCalled();
    });

    it('halts on the broadcast killswitch and records it as a cancellation', async () => {
      // There is no resume in v1, so leaving it SENDING with thousands of
      // PENDING rows would be a state nothing can move out of.
      m.broadcastRecipient.findUnique.mockResolvedValue(pendingRecipient());
      m.broadcast.findUnique.mockResolvedValue(broadcast());
      flag.mockImplementation(async (key: string) => key === 'killswitch.admin_broadcast_send');

      await processor.handle({ kind: 'deliver', broadcastId: 7, recipientId: 31 });
      expect(resend.send).not.toHaveBeenCalled();
      expect(m.broadcast.updateMany).toHaveBeenCalledWith({
        where: { id: 7, status: 'SENDING' },
        data: expect.objectContaining({ status: 'CANCELLED' }),
      });
    });

    it('a killswitch halt ROLLS UP the ledger, so a stopped send does not read "0 sent"', async () => {
      // finalize() is the only other writer of these columns and requires status
      // SENDING — which this transition has just left. Without the roll-up the
      // console log reported "0 sent" forever for a broadcast that had already
      // mailed thousands of people before the switch was thrown, which is the
      // most misleading thing this feature could tell someone auditing what left
      // the building.
      m.broadcastRecipient.findUnique.mockResolvedValue(pendingRecipient());
      m.broadcast.findUnique.mockResolvedValue(broadcast());
      m.broadcastRecipient.groupBy.mockResolvedValue([
        { status: 'SENT', _count: { _all: 1204 } },
        { status: 'PENDING', _count: { _all: 3796 } },
      ]);
      flag.mockImplementation(async (key: string) => key === 'killswitch.admin_broadcast_send');

      await processor.handle({ kind: 'deliver', broadcastId: 7, recipientId: 31 });
      expect(m.broadcast.updateMany).toHaveBeenCalledWith({
        where: { id: 7, status: 'SENDING' },
        data: expect.objectContaining({
          status: 'CANCELLED',
          sentCount: 1204,
          skippedCount: 0,
          failedCount: 0,
        }),
      });
    });

    it('also halts on the GLOBAL transactional-email killswitch', async () => {
      // A direct Resend call would otherwise escape the global email stop the
      // way sendJobAlert already does — not a carve-out worth repeating on the
      // highest-volume sender in the product.
      m.broadcastRecipient.findUnique.mockResolvedValue(pendingRecipient());
      m.broadcast.findUnique.mockResolvedValue(broadcast());
      flag.mockImplementation(async (key: string) => key === 'killswitch.transactional_emails');

      await processor.handle({ kind: 'deliver', broadcastId: 7, recipientId: 31 });
      expect(resend.send).not.toHaveBeenCalled();
    });

    it('skips a recipient whose account was deleted mid-send', async () => {
      // A large send spans minutes, and userId is a loose id with no FK
      // precisely so the ledger survives the deletion — which means the ledger
      // alone cannot tell us the person is gone.
      m.broadcastRecipient.findUnique.mockResolvedValue(pendingRecipient());
      m.broadcast.findUnique.mockResolvedValue(broadcast());
      m.user.findUnique.mockResolvedValue(null);

      await processor.handle({ kind: 'deliver', broadcastId: 7, recipientId: 31 });
      expect(resend.send).not.toHaveBeenCalled();
      expect(m.broadcastRecipient.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 31, status: 'PENDING' },
          data: expect.objectContaining({ status: 'SKIPPED' }),
        }),
      );
    });

    it('rethrows a send failure and LEAVES the row PENDING so the retry re-sends', async () => {
      m.broadcastRecipient.findUnique.mockResolvedValue(pendingRecipient());
      m.broadcast.findUnique.mockResolvedValue(broadcast());
      m.user.findUnique.mockResolvedValue({ id: 99 });
      resend.send.mockRejectedValue(new Error('resend 429'));

      await expect(
        processor.handle({ kind: 'deliver', broadcastId: 7, recipientId: 31 }),
      ).rejects.toThrow('resend 429');
      // The reason is recorded, but the STATUS is untouched — marking it FAILED
      // here would make BullMQ's retry skip the row it was retrying for.
      const data = m.broadcastRecipient.update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
      expect(data).not.toHaveProperty('status');
      expect(data.statusReason).toContain('resend 429');
    });

    it('renders the CTA only when both halves are present', async () => {
      m.broadcastRecipient.findUnique.mockResolvedValue(pendingRecipient());
      m.broadcast.findUnique.mockResolvedValue(
        broadcast({ ctaLabel: 'Status page', ctaUrl: 'https://careerqueue.in/status' }),
      );
      m.user.findUnique.mockResolvedValue({ id: 99 });

      await processor.handle({ kind: 'deliver', broadcastId: 7, recipientId: 31 });
      const opts = resend.send.mock.calls[0]?.[0] as { html: string; to: string };
      expect(opts.to).toBe('r@acme.test');
      expect(opts.html).toContain('https://careerqueue.in/status');
    });
  });

  // --- plan ----------------------------------------------------------------

  describe('plan', () => {
    it('writes the ledger with skipDuplicates so a re-run after a restart is a no-op', async () => {
      // app.enableShutdownHooks() is never called in this repo, so a deploy
      // during planning kills the job and BullMQ re-runs it from the start.
      m.broadcast.findUnique.mockResolvedValue(broadcast());
      m.user.findMany.mockResolvedValueOnce([{ id: 1, email: 'a@x.test' }]).mockResolvedValue([]);
      m.broadcastRecipient.count.mockResolvedValue(1);
      m.broadcastRecipient.findMany.mockResolvedValue([{ id: 55 }]);

      await processor.handle({ kind: 'plan', broadcastId: 7 });
      expect(m.broadcastRecipient.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ skipDuplicates: true }),
      );
    });

    it('reads recipientCount back from the table rather than counting its own inserts', async () => {
      // skipDuplicates makes the insert count the number THIS pass wrote — on a
      // re-run after a mid-plan restart that is a fraction of the real total.
      m.broadcast.findUnique.mockResolvedValue(broadcast());
      m.user.findMany.mockResolvedValueOnce([{ id: 1, email: 'a@x.test' }]).mockResolvedValue([]);
      m.broadcastRecipient.createMany.mockResolvedValue({ count: 0 });
      m.broadcastRecipient.count.mockResolvedValue(4182);
      m.broadcastRecipient.findMany.mockResolvedValue([{ id: 55 }]);

      await processor.handle({ kind: 'plan', broadcastId: 7 });
      expect(m.broadcast.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { recipientCount: 4182 },
      });
    });

    it('ENQUEUES a delivery job for every pending recipient', async () => {
      // The review found that deleting the entire email fan-out left all 19
      // processor tests green: every other plan test asserted what plan does
      // BEFORE the fan-out, and none asserted the fan-out itself. A broadcast
      // that plans a perfect ledger and never sends anything is the failure this
      // pins.
      m.broadcast.findUnique.mockResolvedValue(broadcast());
      m.user.findMany.mockResolvedValueOnce([{ id: 1, email: 'a@x.test' }]).mockResolvedValue([]);
      m.broadcastRecipient.count.mockResolvedValue(3);
      m.broadcastRecipient.findMany.mockResolvedValue([{ id: 55 }, { id: 56 }, { id: 57 }]);

      await processor.handle({ kind: 'plan', broadcastId: 7 });

      expect(enqueue).toHaveBeenCalledTimes(1);
      expect(enqueue).toHaveBeenCalledWith([
        { kind: 'deliver', broadcastId: 7, recipientId: 55 },
        { kind: 'deliver', broadcastId: 7, recipientId: 56 },
        { kind: 'deliver', broadcastId: 7, recipientId: 57 },
      ]);
    });

    it('covers every pending recipient exactly once when chunking', async () => {
      // INSERT_CHUNK is 500, so 1,200 rows must arrive as 3 calls whose union is
      // the whole set with no gap and no repeat. An off-by-one in the slice
      // window silently drops or double-sends to real people.
      const pending = Array.from({ length: 1_200 }, (_, i) => ({ id: i + 1 }));
      m.broadcast.findUnique.mockResolvedValue(broadcast());
      m.user.findMany.mockResolvedValueOnce([{ id: 1, email: 'a@x.test' }]).mockResolvedValue([]);
      m.broadcastRecipient.count.mockResolvedValue(1_200);
      m.broadcastRecipient.findMany.mockResolvedValue(pending);

      await processor.handle({ kind: 'plan', broadcastId: 7 });

      expect(enqueue).toHaveBeenCalledTimes(3);
      const ids = enqueue.mock.calls
        .flatMap((c) => c[0] as { recipientId: number }[])
        .map((j) => j.recipientId);
      expect(ids).toHaveLength(1_200);
      expect(new Set(ids).size).toBe(1_200);
      expect(Math.min(...ids)).toBe(1);
      expect(Math.max(...ids)).toBe(1_200);
    });

    it('does nothing when the broadcast was cancelled before the worker picked it up', async () => {
      m.broadcast.findUnique.mockResolvedValue(broadcast({ status: 'CANCELLED' }));
      await processor.handle({ kind: 'plan', broadcastId: 7 });
      expect(m.broadcastRecipient.createMany).not.toHaveBeenCalled();
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('writes in-app rows as PLATFORM_ANNOUNCEMENT with NO linkUrl', async () => {
      // Notification.linkUrl is a recruiter-portal-RELATIVE path handed to
      // router.push. ctaUrl is a validated ABSOLUTE https URL for the email —
      // pushing that into the router produces a broken in-portal navigation.
      m.broadcast.findUnique.mockResolvedValue(
        broadcast({ inAppEnabled: true, ctaLabel: 'Status', ctaUrl: 'https://careerqueue.in/s' }),
      );
      // A short page ends the cursor loop immediately, so the email pass
      // consumes ONE findMany call and the in-app pass the next one.
      m.user.findMany
        .mockResolvedValueOnce([{ id: 1, email: 'a@x.test' }])
        .mockResolvedValueOnce([{ id: 1 }])
        .mockResolvedValue([]);
      m.broadcastRecipient.count.mockResolvedValue(1);
      m.broadcastRecipient.findMany.mockResolvedValue([{ id: 55 }]);

      await processor.handle({ kind: 'plan', broadcastId: 7 });
      const rows = m.notification.createMany.mock.calls[0]?.[0]?.data as Record<string, unknown>[];
      expect(rows[0]).toMatchObject({ type: 'PLATFORM_ANNOUNCEMENT', title: 'Scheduled maintenance' });
      expect(rows[0]).not.toHaveProperty('linkUrl');
    });

    it('makes the in-app write IDEMPOTENT — broadcastId plus skipDuplicates', async () => {
      // The bug three independent review lenses found: plan carries attempts:3
      // and is re-run after any later throw, and after a deploy kills it (this
      // repo never calls app.enableShutdownHooks()). Without a collision key
      // this was the ONE write in the planner that duplicated, putting the same
      // announcement in every recruiter's bell two or three times. The email
      // ledger had @@unique([broadcastId,userId]); the bell rows had nothing.
      m.broadcast.findUnique.mockResolvedValue(broadcast({ inAppEnabled: true }));
      m.user.findMany
        .mockResolvedValueOnce([{ id: 1, email: 'a@x.test' }])
        .mockResolvedValueOnce([{ id: 1 }])
        .mockResolvedValue([]);
      m.broadcastRecipient.count.mockResolvedValue(1);
      m.broadcastRecipient.findMany.mockResolvedValue([{ id: 55 }]);

      await processor.handle({ kind: 'plan', broadcastId: 7 });
      const call = m.notification.createMany.mock.calls[0]?.[0] as {
        data: Record<string, unknown>[];
        skipDuplicates?: boolean;
      };
      expect(call.skipDuplicates).toBe(true);
      expect(call.data[0]).toMatchObject({ broadcastId: 7 });
    });

    it('narrows the BELL audience below the ledger audience on an ALL_USERS broadcast', async () => {
      // The ledger addresses everyone; the bell must address active recruiters
      // only. Swapping writeInAppRows to the email predicate would write a
      // Notification row for every candidate — rows that apps/web renders
      // nowhere, so the mistake would be invisible in production.
      m.broadcast.findUnique.mockResolvedValue(
        broadcast({ segment: 'ALL_USERS', emailEnabled: true, inAppEnabled: true }),
      );
      m.user.findMany
        .mockResolvedValueOnce([{ id: 1, email: 'a@x.test' }])
        .mockResolvedValueOnce([{ id: 1 }])
        .mockResolvedValue([]);
      m.broadcastRecipient.count.mockResolvedValue(1);
      m.broadcastRecipient.findMany.mockResolvedValue([{ id: 55 }]);

      await processor.handle({ kind: 'plan', broadcastId: 7 });

      // call[0] is the ledger pass, call[1] is the in-app pass.
      expect(m.user.findMany.mock.calls[0]?.[0]?.where).toEqual({
        OR: [{ role: 'CANDIDATE' }, { role: 'RECRUITER', recruiter: { deactivatedAt: null } }],
      });
      expect(m.user.findMany.mock.calls[1]?.[0]?.where).toEqual({
        role: 'RECRUITER',
        recruiter: { deactivatedAt: null },
      });
    });

    it('an in-app-only broadcast finalises itself without enqueueing any delivery', async () => {
      m.broadcast.findUnique.mockResolvedValue(
        broadcast({ emailEnabled: false, inAppEnabled: true }),
      );
      m.user.findMany
        .mockResolvedValueOnce([{ id: 1, email: 'a@x.test' }])
        .mockResolvedValueOnce([{ id: 1 }])
        .mockResolvedValue([]);
      m.broadcastRecipient.count.mockResolvedValue(1);
      m.broadcastRecipient.groupBy.mockResolvedValue([{ status: 'SENT', _count: { _all: 1 } }]);

      await processor.handle({ kind: 'plan', broadcastId: 7 });
      // The bell rows really were written — otherwise this test would pass while
      // delivering nothing at all.
      expect(m.notification.createMany).toHaveBeenCalled();
      expect(enqueue).not.toHaveBeenCalled();
      expect(m.broadcastRecipient.updateMany).toHaveBeenCalledWith({
        where: { broadcastId: 7, status: 'PENDING' },
        data: expect.objectContaining({ status: 'SENT' }),
      });
    });

    it('addresses an in-app-only ALL_USERS broadcast to recruiters, not to everyone', async () => {
      // Writing candidate ledger rows for a channel that cannot reach them would
      // inflate the number an admin reads as "people reached".
      m.broadcast.findUnique.mockResolvedValue(
        broadcast({ segment: 'ALL_USERS', emailEnabled: false, inAppEnabled: true }),
      );
      m.user.findMany.mockResolvedValue([]);
      await processor.handle({ kind: 'plan', broadcastId: 7 });
      const where = m.user.findMany.mock.calls[0]?.[0]?.where;
      expect(where).toEqual({ role: 'RECRUITER', recruiter: { deactivatedAt: null } });
    });
  });

  // --- finalize ------------------------------------------------------------

  describe('finalize', () => {
    it('a partial delivery is SENT and carries its counts', async () => {
      // "Sent, 12 of 4,000 bounced" and "this never went out" are different
      // facts an admin must be able to tell apart at a glance.
      m.broadcastRecipient.count.mockResolvedValue(0);
      m.broadcastRecipient.groupBy.mockResolvedValue([
        { status: 'SENT', _count: { _all: 3988 } },
        { status: 'FAILED', _count: { _all: 12 } },
      ]);

      await processor.recordTerminalFailure(7, 31, 'bad address');
      expect(m.broadcast.updateMany).toHaveBeenCalledWith({
        where: { id: 7, status: 'SENDING' },
        data: { status: 'SENT', sentCount: 3988, skippedCount: 0, failedCount: 12 },
      });
    });

    it('a broadcast where nothing was delivered is FAILED, not SENT', async () => {
      m.broadcastRecipient.count.mockResolvedValue(0);
      m.broadcastRecipient.groupBy.mockResolvedValue([{ status: 'FAILED', _count: { _all: 40 } }]);

      await processor.recordTerminalFailure(7, 31, 'smtp down');
      expect(m.broadcast.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
      );
    });

    it('does not finalise while recipients are still pending', async () => {
      m.broadcastRecipient.count.mockResolvedValue(500);
      await processor.recordTerminalFailure(7, 31, 'bad address');
      expect(m.broadcast.updateMany).not.toHaveBeenCalled();
    });

    it('finalises only a broadcast still in SENDING, so a cancel is not overwritten', async () => {
      m.broadcastRecipient.count.mockResolvedValue(0);
      m.broadcastRecipient.groupBy.mockResolvedValue([{ status: 'SENT', _count: { _all: 1 } }]);
      await processor.recordTerminalFailure(7, 31, 'x');
      expect(m.broadcast.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 7, status: 'SENDING' } }),
      );
    });
  });
});
