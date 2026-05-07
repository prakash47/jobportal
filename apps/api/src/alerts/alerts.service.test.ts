import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    jobAlert: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('@jobportal/feature-flags', () => ({
  isFlagEnabled: vi.fn(),
}));

import { prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { AlertsService } from './alerts.service';

const mockedPrisma = prisma as unknown as {
  jobAlert: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
};
const mockedFlag = isFlagEnabled as ReturnType<typeof vi.fn>;

const validInput = {
  name: 'React Bangalore',
  query: { q: 'react', citySlugs: ['bangalore'] },
  frequency: 'daily' as const,
};

describe('AlertsService.create', () => {
  let service: AlertsService;
  beforeEach(() => {
    vi.resetAllMocks();
    service = new AlertsService();
  });

  it('persists a new alert when under the cap', async () => {
    mockedPrisma.jobAlert.count.mockResolvedValue(3);
    mockedPrisma.jobAlert.create.mockResolvedValue({ id: 7, ...validInput });
    const out = await service.create(42, validInput);
    expect(out.id).toBe(7);
    expect(mockedPrisma.jobAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 42, frequency: 'daily', isActive: true }),
    });
  });

  it('rejects with ConflictException when the user already has 10 alerts', async () => {
    mockedPrisma.jobAlert.count.mockResolvedValue(10);
    await expect(service.create(42, validInput)).rejects.toBeInstanceOf(ConflictException);
    expect(mockedPrisma.jobAlert.create).not.toHaveBeenCalled();
  });
});

describe('AlertsService.get / update / delete (ownership)', () => {
  let service: AlertsService;
  beforeEach(() => {
    vi.resetAllMocks();
    service = new AlertsService();
  });

  it('get throws NotFoundException when row is missing', async () => {
    mockedPrisma.jobAlert.findUnique.mockResolvedValue(null);
    await expect(service.get(42, 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('get throws NotFoundException on cross-user access (no existence leak)', async () => {
    mockedPrisma.jobAlert.findUnique.mockResolvedValue({ id: 1, userId: 99 });
    await expect(service.get(42, 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update only writes provided fields', async () => {
    mockedPrisma.jobAlert.findUnique.mockResolvedValue({ id: 1, userId: 42 });
    mockedPrisma.jobAlert.update.mockResolvedValue({ id: 1, userId: 42, isActive: false });
    await service.update(42, 1, { isActive: false });
    const call = mockedPrisma.jobAlert.update.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(Object.keys(call.data)).toEqual(['isActive']);
  });
});

describe('AlertsService.unsubscribeByToken', () => {
  let service: AlertsService;
  beforeEach(() => {
    vi.resetAllMocks();
    service = new AlertsService();
  });

  it('flips active=false and returns the alert name', async () => {
    mockedPrisma.jobAlert.findUnique.mockResolvedValue({
      id: 5,
      name: 'My Alert',
      isActive: true,
    });
    mockedPrisma.jobAlert.update.mockResolvedValue({ id: 5, isActive: false });
    const out = await service.unsubscribeByToken('opaque-token');
    expect(out).toEqual({ alertName: 'My Alert' });
    expect(mockedPrisma.jobAlert.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { isActive: false },
    });
  });

  it('idempotent — already-paused alert is a no-op', async () => {
    mockedPrisma.jobAlert.findUnique.mockResolvedValue({
      id: 5,
      name: 'My Alert',
      isActive: false,
    });
    await service.unsubscribeByToken('opaque-token');
    expect(mockedPrisma.jobAlert.update).not.toHaveBeenCalled();
  });

  it('404s on unknown token', async () => {
    mockedPrisma.jobAlert.findUnique.mockResolvedValue(null);
    await expect(service.unsubscribeByToken('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AlertsService.canRunTest (killswitch)', () => {
  let service: AlertsService;
  beforeEach(() => {
    vi.resetAllMocks();
    service = new AlertsService();
  });

  it('returns true when killswitch is OFF', async () => {
    mockedFlag.mockResolvedValue(false);
    expect(await service.canRunTest()).toBe(true);
  });

  it('returns false when killswitch is ON', async () => {
    mockedFlag.mockResolvedValue(true);
    expect(await service.canRunTest()).toBe(false);
  });
});
