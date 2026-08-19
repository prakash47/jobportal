import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    broadcast: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    broadcastRecipient: {
      count: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
      updateMany: vi.fn(),
    },
    user: { count: vi.fn(), findUnique: vi.fn() },
    profileAuditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  Prisma: {},
}));

vi.mock('@jobportal/feature-flags', () => ({
  FLAG: { KILL_ADMIN_BROADCAST_SEND: 'killswitch.admin_broadcast_send' },
  isFlagEnabled: vi.fn(),
}));

import { prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { AdminBroadcastsService } from './admin-broadcasts.service';

type Mock = ReturnType<typeof vi.fn>;
const m = prisma as unknown as {
  broadcast: {
    count: Mock;
    findMany: Mock;
    findUnique: Mock;
    create: Mock;
    update: Mock;
    updateMany: Mock;
  };
  broadcastRecipient: { count: Mock; findMany: Mock; groupBy: Mock; updateMany: Mock };
  user: { count: Mock; findUnique: Mock };
  profileAuditLog: { create: Mock };
  $transaction: Mock;
};
const flag = isFlagEnabled as unknown as Mock;

const queue = { enqueuePlan: vi.fn() };
const resend = { send: vi.fn() };

/** A sendable draft: operational, tested, email to recruiters. */
function draft(over: Record<string, unknown> = {}) {
  return {
    id: 7,
    subject: 'Scheduled maintenance',
    body: 'We are down 02:00–04:00 IST.',
    category: 'OPERATIONAL',
    segment: 'ALL_RECRUITERS',
    emailEnabled: true,
    inAppEnabled: false,
    ctaLabel: null,
    ctaUrl: null,
    status: 'DRAFT',
    createdById: 1,
    recipientCount: null,
    sentCount: 0,
    skippedCount: 0,
    failedCount: 0,
    testSentAt: new Date('2026-08-19T05:00:00Z'),
    sentAt: null,
    cancelledAt: null,
    ...over,
  };
}

describe('AdminBroadcastsService', () => {
  let service: AdminBroadcastsService;

  beforeEach(() => {
    vi.resetAllMocks();
    flag.mockResolvedValue(false);
    m.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
    m.profileAuditLog.create.mockResolvedValue({});
    m.broadcast.updateMany.mockResolvedValue({ count: 1 });
    m.broadcast.update.mockResolvedValue(draft());
    m.broadcastRecipient.groupBy.mockResolvedValue([]);
    m.broadcastRecipient.findMany.mockResolvedValue([]);
    m.broadcastRecipient.count.mockResolvedValue(0);
    m.user.count.mockResolvedValue(42);
    m.user.findUnique.mockResolvedValue({ id: 1, name: 'Ops', email: 'ops@careerqueue.in' });
    queue.enqueuePlan.mockResolvedValue(undefined);
    resend.send.mockResolvedValue(undefined);
    service = new AdminBroadcastsService(queue as unknown as never, resend as unknown as never);
  });

  // --- send: the guards ----------------------------------------------------

  describe('send', () => {
    it('503s when the killswitch is ON — and never reaches the queue', async () => {
      flag.mockResolvedValue(true);
      await expect(service.send(1, 7)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(queue.enqueuePlan).not.toHaveBeenCalled();
      // The guard runs BEFORE the row is even read, so a killed send cannot
      // move a broadcast out of DRAFT as a side effect.
      expect(m.broadcast.updateMany).not.toHaveBeenCalled();
    });

    it('polarity: an OFF killswitch permits the send', async () => {
      // killswitch.* throws when ENABLED, the inverse of a feature toggle like
      // moderation.reports.enabled. The two shapes are one keystroke apart and
      // getting it backwards would permanently disable the feature.
      m.broadcast.findUnique.mockResolvedValue(draft());
      flag.mockResolvedValue(false);
      await service.send(1, 7);
      expect(queue.enqueuePlan).toHaveBeenCalledWith(7);
    });

    it('refuses a PROMOTIONAL broadcast and names the missing rails', async () => {
      m.broadcast.findUnique.mockResolvedValue(draft({ category: 'PROMOTIONAL' }));
      await expect(service.send(1, 7)).rejects.toThrow(/consent is not enforced/i);
      expect(queue.enqueuePlan).not.toHaveBeenCalled();
    });

    it('refuses to send without a test send', async () => {
      m.broadcast.findUnique.mockResolvedValue(draft({ testSentAt: null }));
      await expect(service.send(1, 7)).rejects.toBeInstanceOf(BadRequestException);
      expect(queue.enqueuePlan).not.toHaveBeenCalled();
    });

    it('refuses an empty segment rather than reporting "sent to 0 people"', async () => {
      m.broadcast.findUnique.mockResolvedValue(draft());
      m.user.count.mockResolvedValue(0);
      await expect(service.send(1, 7)).rejects.toThrow(/no recipients/i);
      expect(queue.enqueuePlan).not.toHaveBeenCalled();
    });

    it('409s a broadcast that is not a DRAFT', async () => {
      m.broadcast.findUnique.mockResolvedValue(draft({ status: 'SENT' }));
      await expect(service.send(1, 7)).rejects.toBeInstanceOf(ConflictException);
    });

    it('404s an unknown broadcast', async () => {
      m.broadcast.findUnique.mockResolvedValue(null);
      await expect(service.send(1, 7)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('claims the send with a CONDITIONAL update — this is the double-submit guard', async () => {
      m.broadcast.findUnique.mockResolvedValue(draft());
      await service.send(1, 7);
      // The `status: 'DRAFT'` predicate is what makes two simultaneous Sends
      // resolve to exactly one winner. Without it both would proceed and the
      // platform would receive the message twice.
      expect(m.broadcast.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 7, status: 'DRAFT' } }),
      );
    });

    it('409s the loser of a race, even though the earlier read saw a DRAFT', async () => {
      m.broadcast.findUnique.mockResolvedValue(draft());
      m.broadcast.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.send(1, 7)).rejects.toBeInstanceOf(ConflictException);
      expect(queue.enqueuePlan).not.toHaveBeenCalled();
    });

    it('writes an audit row carrying counts and shape — never the subject or body', async () => {
      m.broadcast.findUnique.mockResolvedValue(draft());
      await service.send(1, 7);

      const call = m.profileAuditLog.create.mock.calls[0]?.[0] as {
        data: { userId: number; action: string; diff: Record<string, unknown> };
      };
      expect(call.data.userId).toBe(1);
      expect(call.data.action).toBe('BROADCAST_SENT');
      expect(call.data.diff).toEqual({
        broadcastId: 7,
        category: 'OPERATIONAL',
        segment: 'ALL_RECRUITERS',
        channels: { email: true, inApp: false },
        estimatedRecipients: 42,
      });
      // Asserted over the serialised diff rather than by listing keys: a future
      // field that happened to embed the message would slip past a key check.
      const serialised = JSON.stringify(call.data.diff);
      expect(serialised).not.toContain('Scheduled maintenance');
      expect(serialised).not.toContain('02:00');
    });

    it('rolls the status back to DRAFT when the queue is unreachable', async () => {
      // Otherwise the broadcast claims to be SENDING forever, reaches nobody,
      // and the admin is told it worked.
      m.broadcast.findUnique.mockResolvedValue(draft());
      queue.enqueuePlan.mockRejectedValue(new Error('redis down'));

      await expect(service.send(1, 7)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(m.broadcast.updateMany).toHaveBeenLastCalledWith({
        where: { id: 7, status: 'SENDING' },
        data: { status: 'DRAFT', sentAt: null },
      });
    });

    it('does NOT delete the audit row when the enqueue fails', async () => {
      // The admin did pull the lever. Audit rows are not rewritten because the
      // attempt failed.
      m.broadcast.findUnique.mockResolvedValue(draft());
      queue.enqueuePlan.mockRejectedValue(new Error('redis down'));
      await expect(service.send(1, 7)).rejects.toThrow();
      expect(m.profileAuditLog.create).toHaveBeenCalledTimes(1);
    });
  });

  // --- update: the test-send attestation -----------------------------------

  describe('update', () => {
    it('clears testSentAt when the content changed', async () => {
      // A test send attests that a human read THE MESSAGE THAT IS ABOUT TO GO
      // OUT. If the subject can change while the attestation survives, the rail
      // is decorative.
      m.broadcast.findUnique.mockResolvedValue(draft());
      await service.update(7, {
        subject: 'Different subject',
        body: 'We are down 02:00–04:00 IST.',
        category: 'OPERATIONAL',
        segment: 'ALL_RECRUITERS',
        emailEnabled: true,
        inAppEnabled: false,
      });
      const data = m.broadcast.update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
      expect(data.testSentAt).toBeNull();
    });

    it('leaves testSentAt alone when nothing actually changed', async () => {
      m.broadcast.findUnique.mockResolvedValue(draft());
      await service.update(7, {
        subject: 'Scheduled maintenance',
        body: 'We are down 02:00–04:00 IST.',
        category: 'OPERATIONAL',
        segment: 'ALL_RECRUITERS',
        emailEnabled: true,
        inAppEnabled: false,
      });
      const data = m.broadcast.update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
      // Absent, not undefined: exactOptionalPropertyTypes makes an explicit
      // undefined a type error, and Prisma reads a MISSING key as "leave alone".
      // hasOwnProperty is the only assertion that tells the fix from the bug,
      // since reading a missing key also yields undefined.
      expect(Object.prototype.hasOwnProperty.call(data, 'testSentAt')).toBe(false);
    });

    it('treats a changed segment as a content change', async () => {
      // Who receives it is part of what an admin is approving when they read the
      // test copy.
      m.broadcast.findUnique.mockResolvedValue(draft());
      await service.update(7, {
        subject: 'Scheduled maintenance',
        body: 'We are down 02:00–04:00 IST.',
        category: 'OPERATIONAL',
        segment: 'ALL_USERS',
        emailEnabled: true,
        inAppEnabled: false,
      });
      const data = m.broadcast.update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
      expect(data.testSentAt).toBeNull();
    });

    it('409s an edit to anything that is not a draft', async () => {
      m.broadcast.findUnique.mockResolvedValue(draft({ status: 'SENDING' }));
      await expect(
        service.update(7, {
          subject: 'x',
          body: 'y',
          category: 'OPERATIONAL',
          segment: 'ALL_RECRUITERS',
          emailEnabled: true,
          inAppEnabled: false,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // --- testSend ------------------------------------------------------------

  describe('testSend', () => {
    it('reads the address from the DATABASE, not the JWT claim', async () => {
      // A token issued before an email change still carries the old address, so
      // a test send would land somewhere the admin no longer controls while
      // looking like it proved something.
      m.broadcast.findUnique.mockResolvedValue(draft());
      m.user.findUnique.mockResolvedValue({ email: 'current@careerqueue.in' });
      await service.testSend(1, 7);
      expect(m.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 } }),
      );
      expect(resend.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'current@careerqueue.in' }),
      );
    });

    it('marks the test copy so it cannot be mistaken for the real announcement', async () => {
      m.broadcast.findUnique.mockResolvedValue(draft());
      await service.testSend(1, 7);
      const opts = resend.send.mock.calls[0]?.[0] as { subject: string };
      expect(opts.subject.startsWith('[TEST] ')).toBe(true);
    });

    it('stamps testSentAt only AFTER Resend accepted it', async () => {
      // Stamping first would let a failed test satisfy the send precondition,
      // which is the one thing the column exists for.
      m.broadcast.findUnique.mockResolvedValue(draft());
      resend.send.mockRejectedValue(new Error('resend down'));
      await expect(service.testSend(1, 7)).rejects.toThrow('resend down');
      expect(m.broadcast.update).not.toHaveBeenCalled();
    });

    it('is NOT blocked by the send killswitch', async () => {
      // That switch stops a message reaching the platform; this reaches one
      // staff inbox, and an operator who paused sending is exactly who needs to
      // check a draft renders before re-enabling.
      flag.mockResolvedValue(true);
      m.broadcast.findUnique.mockResolvedValue(draft());
      await expect(service.testSend(1, 7)).resolves.toBeTruthy();
      expect(resend.send).toHaveBeenCalled();
    });
  });

  // --- cancel --------------------------------------------------------------

  describe('cancel', () => {
    it('stops a send that is already in flight', async () => {
      m.broadcast.findUnique.mockResolvedValue(draft({ status: 'SENDING' }));
      await service.cancel(1, 7);
      expect(m.broadcast.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 7, status: 'SENDING' } }),
      );
    });

    it('records how much had already left, so the audit does not imply a clean undo', async () => {
      m.broadcast.findUnique.mockResolvedValue(draft({ status: 'SENDING' }));
      m.broadcastRecipient.count.mockResolvedValue(1204);
      await service.cancel(1, 7);
      const call = m.profileAuditLog.create.mock.calls[0]?.[0] as {
        data: { action: string; diff: Record<string, unknown> };
      };
      expect(call.data.action).toBe('BROADCAST_CANCELLED');
      expect(call.data.diff).toMatchObject({
        broadcastId: 7,
        status: { before: 'SENDING', after: 'CANCELLED' },
        alreadySentCount: 1204,
      });
    });

    it('409s a broadcast that has already finished', async () => {
      for (const status of ['SENT', 'CANCELLED', 'FAILED']) {
        vi.clearAllMocks();
        m.broadcast.findUnique.mockResolvedValue(draft({ status }));
        await expect(service.cancel(1, 7)).rejects.toBeInstanceOf(ConflictException);
      }
    });
  });

  // --- list ----------------------------------------------------------------

  describe('list', () => {
    it('escapes a LIKE wildcard so ?q=% does not match every broadcast', async () => {
      // Prisma's `contains` compiles to an unescaped LIKE. This exact bug has
      // shipped twice in this repo.
      m.broadcast.count.mockResolvedValue(0);
      m.broadcast.findMany.mockResolvedValue([]);
      await service.list({ q: '%' });
      const where = m.broadcast.findMany.mock.calls[0]?.[0]?.where as {
        subject: { contains: string; mode: string };
      };
      expect(where.subject.contains).not.toBe('%');
      expect(where.subject.mode).toBe('insensitive');
    });

    it('counts and lists over the SAME where-clause', async () => {
      m.broadcast.count.mockResolvedValue(3);
      m.broadcast.findMany.mockResolvedValue([]);
      await service.list({ status: 'SENT', q: 'maintenance' });
      const countWhere = m.broadcast.count.mock.calls[0]?.[0]?.where;
      const listWhere = m.broadcast.findMany.mock.calls[0]?.[0]?.where;
      expect(countWhere).toEqual(listWhere);
    });
  });

  // --- previewCount --------------------------------------------------------

  describe('previewCount', () => {
    it('reports zero in-app reach for a candidate segment rather than the email count', async () => {
      m.user.count.mockResolvedValue(5000);
      const res = await service.previewCount({ segment: 'ALL_CANDIDATES' });
      expect(res.emailRecipients).toBe(5000);
      expect(res.inAppRecipients).toBe(0);
    });
  });
});
