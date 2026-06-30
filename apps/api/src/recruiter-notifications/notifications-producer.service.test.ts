import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/feature-flags', () => ({ isFlagEnabled: vi.fn() }));
vi.mock('@jobportal/db', () => ({
  prisma: {
    notification: { create: vi.fn(), createMany: vi.fn() },
    company: { findUnique: vi.fn() },
  },
  Prisma: {},
}));

import { prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { NotificationsProducerService } from './notifications-producer.service';

const mockedFlag = isFlagEnabled as unknown as ReturnType<typeof vi.fn>;
const m = prisma as unknown as {
  notification: { create: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> };
  company: { findUnique: ReturnType<typeof vi.fn> };
};

describe('NotificationsProducerService', () => {
  let producer: NotificationsProducerService;

  beforeEach(() => {
    vi.resetAllMocks();
    mockedFlag.mockResolvedValue(false); // killswitch OFF → feature live
    producer = new NotificationsProducerService();
  });

  describe('notifyNewApplication', () => {
    it('creates a NEW_APPLICATION row for the job owner', async () => {
      m.notification.create.mockResolvedValue({ id: 1 });
      await producer.notifyNewApplication({
        recruiterUserId: 7,
        jobId: 5,
        jobTitle: 'Backend Engineer',
        candidateName: 'Asha',
      });
      const arg = m.notification.create.mock.calls[0]?.[0] as {
        data: { userId: number; type: string; body: string; linkUrl: string };
      };
      expect(arg.data.userId).toBe(7);
      expect(arg.data.type).toBe('NEW_APPLICATION');
      expect(arg.data.body).toContain('Asha');
      expect(arg.data.body).toContain('Backend Engineer');
      expect(arg.data.linkUrl).toBe('/jobs/5/applicants');
    });

    it('skips silently when the job has no owner (postedById null)', async () => {
      await producer.notifyNewApplication({
        recruiterUserId: null,
        jobId: 5,
        jobTitle: 'X',
        candidateName: 'Y',
      });
      expect(m.notification.create).not.toHaveBeenCalled();
    });

    it('no-ops when the killswitch is ON', async () => {
      mockedFlag.mockResolvedValue(true);
      await producer.notifyNewApplication({
        recruiterUserId: 7,
        jobId: 5,
        jobTitle: 'X',
        candidateName: 'Y',
      });
      expect(m.notification.create).not.toHaveBeenCalled();
    });
  });

  describe('notifyKycDecision', () => {
    it('creates a KYC_VERIFIED row for every recruiter on the company', async () => {
      m.company.findUnique.mockResolvedValue({
        name: 'Acme',
        recruiters: [{ userId: 7 }, { userId: 8 }],
      });
      m.notification.createMany.mockResolvedValue({ count: 2 });

      await producer.notifyKycDecision({ companyId: 3, decision: 'VERIFIED' });

      const arg = m.notification.createMany.mock.calls[0]?.[0] as {
        data: { userId: number; type: string; body: string; linkUrl: string }[];
      };
      expect(arg.data).toHaveLength(2);
      expect(arg.data.map((d) => d.userId)).toEqual([7, 8]);
      expect(arg.data[0]?.type).toBe('KYC_VERIFIED');
      expect(arg.data[0]?.body).toContain('Acme');
      expect(arg.data[0]?.linkUrl).toBe('/kyc');
    });

    it('uses the rejection reason in the body for a REJECTED decision', async () => {
      m.company.findUnique.mockResolvedValue({ name: 'Acme', recruiters: [{ userId: 7 }] });
      m.notification.createMany.mockResolvedValue({ count: 1 });

      await producer.notifyKycDecision({
        companyId: 3,
        decision: 'REJECTED',
        rejectionReason: 'GST number does not match',
      });

      const arg = m.notification.createMany.mock.calls[0]?.[0] as {
        data: { type: string; body: string }[];
      };
      expect(arg.data[0]?.type).toBe('KYC_REJECTED');
      expect(arg.data[0]?.body).toContain('GST number does not match');
    });

    it('skips when the company has no recruiters', async () => {
      m.company.findUnique.mockResolvedValue({ name: 'Acme', recruiters: [] });
      await producer.notifyKycDecision({ companyId: 3, decision: 'VERIFIED' });
      expect(m.notification.createMany).not.toHaveBeenCalled();
    });

    it('no-ops when the killswitch is ON (no company lookup)', async () => {
      mockedFlag.mockResolvedValue(true);
      await producer.notifyKycDecision({ companyId: 3, decision: 'VERIFIED' });
      expect(m.company.findUnique).not.toHaveBeenCalled();
      expect(m.notification.createMany).not.toHaveBeenCalled();
    });
  });
});
