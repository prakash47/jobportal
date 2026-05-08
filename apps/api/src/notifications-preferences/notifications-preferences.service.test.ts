import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    emailPreference: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { prisma } from '@jobportal/db';
import { NotificationsPreferencesService } from './notifications-preferences.service';

const mocked = prisma as unknown as {
  emailPreference: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
};

describe('NotificationsPreferencesService', () => {
  let service: NotificationsPreferencesService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new NotificationsPreferencesService();
  });

  describe('read', () => {
    it('returns row values when a row exists', async () => {
      mocked.emailPreference.findUnique.mockResolvedValue({
        jobAlertsEnabled: false,
        applicationStatusEnabled: true,
        productNewsEnabled: true,
      });
      const out = await service.read(1);
      expect(out).toEqual({
        jobAlertsEnabled: false,
        applicationStatusEnabled: true,
        productNewsEnabled: true,
      });
    });

    it('returns schema defaults when no row exists (no insert)', async () => {
      mocked.emailPreference.findUnique.mockResolvedValue(null);
      const out = await service.read(1);
      expect(out).toEqual({
        jobAlertsEnabled: true,
        applicationStatusEnabled: true,
        productNewsEnabled: false,
      });
      expect(mocked.emailPreference.upsert).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('upsert with create-defaults + patch on first write', async () => {
      mocked.emailPreference.upsert.mockResolvedValue({
        jobAlertsEnabled: true,
        applicationStatusEnabled: false,
        productNewsEnabled: false,
      });
      const out = await service.update(42, { applicationStatusEnabled: false });
      expect(out.applicationStatusEnabled).toBe(false);
      const args = mocked.emailPreference.upsert.mock.calls[0]?.[0];
      expect(args.where).toEqual({ userId: 42 });
      expect(args.create).toMatchObject({
        userId: 42,
        jobAlertsEnabled: true,
        applicationStatusEnabled: false, // patch wins over default in spread
        productNewsEnabled: false,
      });
      expect(args.update).toEqual({ applicationStatusEnabled: false });
    });

    it('partial patch only writes the keys provided', async () => {
      mocked.emailPreference.upsert.mockResolvedValue({
        jobAlertsEnabled: false,
        applicationStatusEnabled: true,
        productNewsEnabled: true,
      });
      await service.update(1, { jobAlertsEnabled: false, productNewsEnabled: true });
      const args = mocked.emailPreference.upsert.mock.calls[0]?.[0];
      expect(args.update).toEqual({
        jobAlertsEnabled: false,
        productNewsEnabled: true,
      });
      expect('applicationStatusEnabled' in args.update).toBe(false);
    });

    it('empty patch is a no-op update (still upserts to ensure row)', async () => {
      mocked.emailPreference.upsert.mockResolvedValue({
        jobAlertsEnabled: true,
        applicationStatusEnabled: true,
        productNewsEnabled: false,
      });
      await service.update(1, {});
      const args = mocked.emailPreference.upsert.mock.calls[0]?.[0];
      expect(args.update).toEqual({});
    });
  });
});
