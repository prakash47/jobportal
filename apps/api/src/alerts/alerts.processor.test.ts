import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/feature-flags', () => ({
  isFlagEnabled: vi.fn(),
}));

vi.mock('@jobportal/db', () => ({
  prisma: {
    jobAlert: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  },
  Prisma: {},
}));

vi.mock('@jobportal/search', () => ({
  searchJobs: vi.fn(),
}));

import { isFlagEnabled } from '@jobportal/feature-flags';
import { prisma } from '@jobportal/db';
import { searchJobs } from '@jobportal/search';
import { AlertsProcessor } from './alerts.processor';

const mockedFlag = isFlagEnabled as ReturnType<typeof vi.fn>;
const mockedSearch = searchJobs as ReturnType<typeof vi.fn>;
const mockedPrisma = prisma as unknown as {
  jobAlert: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

const fakeEmail = {
  sendJobAlert: vi.fn().mockResolvedValue(undefined),
} as { sendJobAlert: ReturnType<typeof vi.fn> };

const baseAlert = {
  id: 1,
  userId: 42,
  name: 'My Alert',
  query: {},
  frequency: 'daily',
  isActive: true,
  lastSentJobIds: [],
  unsubscribeToken: 'tok-abc',
  user: { email: 'u@example.com', emailPreference: null },
};

const jobDoc = (id: number) => ({
  id,
  canonicalSlug: `job-${id}`,
  title: `Job ${id}`,
  description: 'd',
  shortDescription: null,
  companyId: 1,
  companyName: 'Acme',
  companySlug: 'acme',
  skills: [],
  skillSlugs: [],
  skillIds: [],
  citySlugs: [],
  cityIds: [],
  primaryCitySlug: 'bangalore',
  industrySlug: null,
  industryId: null,
  functionalAreaSlug: null,
  status: 'ACTIVE' as const,
  minExperienceMonths: null,
  maxExperienceMonths: null,
  salaryMin: null,
  salaryMax: null,
  postedAt: '2026-05-08T00:00:00Z',
  expiresAt: null,
  title_suggest: { input: [`Job ${id}`] },
});

describe('AlertsProcessor.scanAlert', () => {
  let proc: AlertsProcessor;
  beforeEach(() => {
    vi.resetAllMocks();
    proc = new AlertsProcessor(fakeEmail as unknown as never);
  });

  it('killswitch ON → no DB read, no email, sent=false', async () => {
    mockedFlag.mockResolvedValue(true);
    const out = await proc.scanAlert(1);
    expect(out).toEqual({ sent: false, matched: 0, newCount: 0 });
    expect(mockedPrisma.jobAlert.findUnique).not.toHaveBeenCalled();
    expect(fakeEmail.sendJobAlert).not.toHaveBeenCalled();
  });

  it('alert deleted between enqueue and run → no-op', async () => {
    mockedFlag.mockResolvedValue(false);
    mockedPrisma.jobAlert.findUnique.mockResolvedValue(null);
    const out = await proc.scanAlert(1);
    expect(out.sent).toBe(false);
    expect(fakeEmail.sendJobAlert).not.toHaveBeenCalled();
  });

  it('isActive=false → no email', async () => {
    mockedFlag.mockResolvedValue(false);
    mockedPrisma.jobAlert.findUnique.mockResolvedValue({ ...baseAlert, isActive: false });
    const out = await proc.scanAlert(1);
    expect(out.sent).toBe(false);
  });

  it('user opted out via EmailPreference.jobAlertsEnabled=false → no email', async () => {
    mockedFlag.mockResolvedValue(false);
    mockedPrisma.jobAlert.findUnique.mockResolvedValue({
      ...baseAlert,
      user: { email: 'u@example.com', emailPreference: { jobAlertsEnabled: false } },
    });
    mockedSearch.mockResolvedValue({ hits: [jobDoc(10)], total: 1, took: 1, page: 1, pageSize: 20 });
    const out = await proc.scanAlert(1);
    expect(out.sent).toBe(false);
    expect(fakeEmail.sendJobAlert).not.toHaveBeenCalled();
  });

  it('zero matches → no email, no DB write', async () => {
    mockedFlag.mockResolvedValue(false);
    mockedPrisma.jobAlert.findUnique.mockResolvedValue(baseAlert);
    mockedSearch.mockResolvedValue({ hits: [], total: 0, took: 1, page: 1, pageSize: 20 });
    const out = await proc.scanAlert(1);
    expect(out).toEqual({ sent: false, matched: 0, newCount: 0 });
    expect(fakeEmail.sendJobAlert).not.toHaveBeenCalled();
    expect(mockedPrisma.jobAlert.update).not.toHaveBeenCalled();
  });

  it('all matches already sent → dedupe → no email', async () => {
    mockedFlag.mockResolvedValue(false);
    mockedPrisma.jobAlert.findUnique.mockResolvedValue({
      ...baseAlert,
      lastSentJobIds: [10, 11],
    });
    mockedSearch.mockResolvedValue({
      hits: [jobDoc(10), jobDoc(11)],
      total: 2,
      took: 1,
      page: 1,
      pageSize: 20,
    });
    const out = await proc.scanAlert(1);
    expect(out).toEqual({ sent: false, matched: 2, newCount: 0 });
    expect(fakeEmail.sendJobAlert).not.toHaveBeenCalled();
  });

  it('new matches → email sent, dedupe state extended', async () => {
    mockedFlag.mockResolvedValue(false);
    mockedPrisma.jobAlert.findUnique.mockResolvedValue({
      ...baseAlert,
      lastSentJobIds: [10],
    });
    mockedSearch.mockResolvedValue({
      hits: [jobDoc(10), jobDoc(11), jobDoc(12)],
      total: 3,
      took: 1,
      page: 1,
      pageSize: 20,
    });
    mockedPrisma.jobAlert.update.mockResolvedValue({});
    const out = await proc.scanAlert(1);
    expect(out).toEqual({ sent: true, matched: 3, newCount: 2 });
    expect(fakeEmail.sendJobAlert).toHaveBeenCalledWith(
      'u@example.com',
      expect.objectContaining({
        subject: '2 new matches for "My Alert"',
      }),
    );
    const updateArgs = mockedPrisma.jobAlert.update.mock.calls[0]?.[0] as {
      data: { lastSentJobIds: number[] };
    };
    expect(updateArgs.data.lastSentJobIds).toEqual([10, 11, 12]);
  });

  it('idempotent — re-running on the post-write state matches dedupe + sends nothing', async () => {
    mockedFlag.mockResolvedValue(false);
    // Simulate the state AFTER a successful first run.
    mockedPrisma.jobAlert.findUnique.mockResolvedValue({
      ...baseAlert,
      lastSentJobIds: [10, 11, 12],
    });
    mockedSearch.mockResolvedValue({
      hits: [jobDoc(10), jobDoc(11), jobDoc(12)],
      total: 3,
      took: 1,
      page: 1,
      pageSize: 20,
    });
    const out = await proc.scanAlert(1);
    expect(out.sent).toBe(false);
    expect(fakeEmail.sendJobAlert).not.toHaveBeenCalled();
  });
});

describe('AlertsProcessor.scanFrequency', () => {
  let proc: AlertsProcessor;
  beforeEach(() => {
    vi.resetAllMocks();
    proc = new AlertsProcessor(fakeEmail as unknown as never);
  });

  it('killswitch ON → no DB read', async () => {
    mockedFlag.mockResolvedValue(true);
    await proc.scanFrequency({ frequency: 'daily' });
    expect(mockedPrisma.jobAlert.findMany).not.toHaveBeenCalled();
  });

  it('only fans out for active alerts of the requested frequency', async () => {
    mockedFlag.mockResolvedValue(false);
    mockedPrisma.jobAlert.findMany.mockResolvedValue([]);
    await proc.scanFrequency({ frequency: 'weekly' });
    expect(mockedPrisma.jobAlert.findMany).toHaveBeenCalledWith({
      where: { isActive: true, frequency: 'weekly' },
      select: { id: true },
    });
  });
});
