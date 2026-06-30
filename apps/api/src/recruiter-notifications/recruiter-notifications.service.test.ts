import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/feature-flags', () => ({ isFlagEnabled: vi.fn() }));
vi.mock('@jobportal/db', () => ({
  prisma: {
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
    },
    recruiterNotificationPreference: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { RecruiterNotificationsService } from './recruiter-notifications.service';

const mockedFlag = isFlagEnabled as unknown as ReturnType<typeof vi.fn>;
const m = prisma as unknown as {
  notification: {
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
  recruiterNotificationPreference: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
};

describe('RecruiterNotificationsService', () => {
  let service: RecruiterNotificationsService;

  beforeEach(() => {
    vi.resetAllMocks();
    mockedFlag.mockResolvedValue(false); // killswitch OFF → feature live
    service = new RecruiterNotificationsService();
  });

  describe('list', () => {
    it('maps rows to views and returns counts (page 1 default)', async () => {
      m.notification.findMany.mockResolvedValue([
        {
          id: 9,
          type: 'NEW_APPLICATION',
          title: 'New application',
          body: 'Asha applied to Backend Engineer',
          linkUrl: '/jobs/5/applicants',
          readAt: null,
          createdAt: new Date('2026-06-30T00:00:00Z'),
        },
        {
          id: 8,
          type: 'KYC_VERIFIED',
          title: 'Company verified',
          body: 'Acme has been verified.',
          linkUrl: '/kyc',
          readAt: new Date('2026-06-29T00:00:00Z'),
          createdAt: new Date('2026-06-29T00:00:00Z'),
        },
      ]);
      m.notification.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);

      const out = await service.list(42, {});

      expect(out.total).toBe(2);
      expect(out.unreadCount).toBe(1);
      expect(out.page).toBe(1);
      expect(out.items[0]?.read).toBe(false);
      expect(out.items[1]?.read).toBe(true);
      const findArgs = m.notification.findMany.mock.calls[0]?.[0];
      expect(findArgs.where).toEqual({ userId: 42 });
      expect(findArgs.skip).toBe(0);
      expect(findArgs.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('paginates with the right skip on page 2', async () => {
      m.notification.findMany.mockResolvedValue([]);
      m.notification.count.mockResolvedValue(0);
      await service.list(42, { page: 2 });
      const findArgs = m.notification.findMany.mock.calls[0]?.[0];
      expect(findArgs.skip).toBe(20);
    });
  });

  describe('unreadCount', () => {
    it('counts only unread rows for the user', async () => {
      m.notification.count.mockResolvedValue(3);
      const out = await service.unreadCount(42);
      expect(out).toEqual({ unreadCount: 3 });
      expect(m.notification.count).toHaveBeenCalledWith({ where: { userId: 42, readAt: null } });
    });
  });

  describe('markRead', () => {
    it('marks an owned unread notification read and returns the new unread count', async () => {
      m.notification.updateMany.mockResolvedValue({ count: 1 });
      m.notification.count.mockResolvedValue(0);
      const out = await service.markRead(42, 9);
      expect(out).toEqual({ unreadCount: 0 });
      const updArgs = m.notification.updateMany.mock.calls[0]?.[0];
      expect(updArgs.where).toEqual({ id: 9, userId: 42, readAt: null });
      expect(m.notification.findFirst).not.toHaveBeenCalled();
    });

    it('is a no-op success when the notification is already read (exists + owned)', async () => {
      m.notification.updateMany.mockResolvedValue({ count: 0 });
      m.notification.findFirst.mockResolvedValue({ id: 9 });
      m.notification.count.mockResolvedValue(2);
      const out = await service.markRead(42, 9);
      expect(out).toEqual({ unreadCount: 2 });
    });

    it('404s when the notification is not found / not owned (no leak)', async () => {
      m.notification.updateMany.mockResolvedValue({ count: 0 });
      m.notification.findFirst.mockResolvedValue(null);
      await expect(service.markRead(42, 999)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('is blocked by the killswitch (L3) before touching the DB', async () => {
      mockedFlag.mockResolvedValue(true);
      await expect(service.markRead(42, 9)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(m.notification.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('markAllRead', () => {
    it('marks all unread rows read and returns zero', async () => {
      m.notification.updateMany.mockResolvedValue({ count: 4 });
      const out = await service.markAllRead(42);
      expect(out).toEqual({ unreadCount: 0 });
      expect(m.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 42, readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });

    it('is blocked by the killswitch (L3)', async () => {
      mockedFlag.mockResolvedValue(true);
      await expect(service.markAllRead(42)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(m.notification.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('getPreferences', () => {
    it('returns schema defaults when no row exists (no insert)', async () => {
      m.recruiterNotificationPreference.findUnique.mockResolvedValue(null);
      const out = await service.getPreferences(42);
      expect(out).toEqual({ emailEnabled: true, smsEnabled: false });
      expect(m.recruiterNotificationPreference.upsert).not.toHaveBeenCalled();
    });

    it('returns the row values when a row exists', async () => {
      m.recruiterNotificationPreference.findUnique.mockResolvedValue({
        emailEnabled: false,
        smsEnabled: true,
      });
      const out = await service.getPreferences(42);
      expect(out).toEqual({ emailEnabled: false, smsEnabled: true });
    });
  });

  describe('updatePreferences', () => {
    it('upserts create-with-defaults + patch, update-only-patched-keys', async () => {
      m.recruiterNotificationPreference.upsert.mockResolvedValue({
        emailEnabled: true,
        smsEnabled: true,
      });
      await service.updatePreferences(42, { smsEnabled: true });
      const args = m.recruiterNotificationPreference.upsert.mock.calls[0]?.[0];
      expect(args.where).toEqual({ userId: 42 });
      expect(args.create).toMatchObject({ userId: 42, emailEnabled: true, smsEnabled: true });
      expect(args.update).toEqual({ smsEnabled: true });
    });

    it('drops explicit-undefined keys from the patch', async () => {
      m.recruiterNotificationPreference.upsert.mockResolvedValue({
        emailEnabled: false,
        smsEnabled: false,
      });
      await service.updatePreferences(42, { emailEnabled: false, smsEnabled: undefined });
      const args = m.recruiterNotificationPreference.upsert.mock.calls[0]?.[0];
      expect(args.update).toEqual({ emailEnabled: false });
      expect('smsEnabled' in args.update).toBe(false);
    });

    it('is blocked by the killswitch (L3)', async () => {
      mockedFlag.mockResolvedValue(true);
      await expect(service.updatePreferences(42, { emailEnabled: false })).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(m.recruiterNotificationPreference.upsert).not.toHaveBeenCalled();
    });
  });
});
