import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/feature-flags', () => ({
  isFlagEnabled: vi.fn(),
  FLAG: { MODERATION_REPORTS: 'moderation.reports.enabled' },
}));

vi.mock('@jobportal/db', () => ({
  prisma: {
    job: { findUnique: vi.fn() },
    contentReport: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

// NOT mocked. isPubliclyReadable is a pure status predicate and it is the exact
// thing under test here — stubbing it would let the service and the job page
// drift apart while the suite stayed green, which is the whole reason the rule
// is shared in the first place.
import { prisma } from '@jobportal/db';
import { isFlagEnabled, FLAG } from '@jobportal/feature-flags';
import { ReportsService } from './reports.service';
import type { CreateReportInput } from './dto';

const flagEnabled = isFlagEnabled as unknown as ReturnType<typeof vi.fn>;

// Typed as an explicit object literal, not a Record — a Record-typed mock
// produces a wall of TS18048 under noUncheckedIndexedAccess at typecheck time
// even though vitest runs it happily.
const m = prisma as unknown as {
  job: { findUnique: ReturnType<typeof vi.fn> };
  contentReport: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
};

const REPORTER = 42;
const JOB = 123;
const IP = '203.0.113.50';

const input: CreateReportInput = { targetType: 'JOB', jobId: JOB, reason: 'FAKE_OR_SCAM' };

describe('ReportsService.create', () => {
  let service: ReportsService;

  beforeEach(() => {
    vi.resetAllMocks();
    // This flag is a feature TOGGLE seeded ON, not a killswitch — the default
    // here is therefore true ("reporting is live"), the opposite of every other
    // flag default in this suite.
    flagEnabled.mockResolvedValue(true);
    m.job.findUnique.mockResolvedValue({ id: JOB, status: 'ACTIVE' });
    m.contentReport.findFirst.mockResolvedValue(null);
    m.contentReport.create.mockResolvedValue({ id: 7 });
    service = new ReportsService();
  });

  it('creates a report and returns only its id', async () => {
    await expect(service.create(input, REPORTER, IP)).resolves.toEqual({ id: 7 });
    expect(m.contentReport.create).toHaveBeenCalledTimes(1);
    // The response shape is load-bearing: this endpoint is unauthenticated, so
    // echoing anything back would make it readable.
    const returned = await service.create(input, REPORTER, IP);
    expect(Object.keys(returned)).toEqual(['id']);
  });

  it('reads the flag it is documented to read', async () => {
    await service.create(input, REPORTER, IP);
    expect(flagEnabled).toHaveBeenCalledWith(FLAG.MODERATION_REPORTS);
  });

  // Polarity guard. If someone "fixes" this to match the surrounding killswitch
  // idiom (`if (enabled) throw`), reporting silently dies for everyone while the
  // happy-path test above still passes — so both directions are pinned.
  it('flag OFF → 503 before touching the database', async () => {
    flagEnabled.mockResolvedValue(false);
    await expect(service.create(input, REPORTER, IP)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(m.job.findUnique).not.toHaveBeenCalled();
    expect(m.contentReport.create).not.toHaveBeenCalled();
  });

  it('flag ON → the request proceeds', async () => {
    flagEnabled.mockResolvedValue(true);
    await expect(service.create(input, REPORTER, IP)).resolves.toEqual({ id: 7 });
  });

  it('unknown job → 404', async () => {
    m.job.findUnique.mockResolvedValue(null);
    await expect(service.create(input, REPORTER, IP)).rejects.toBeInstanceOf(NotFoundException);
    expect(m.contentReport.create).not.toHaveBeenCalled();
  });

  // A never-public job must be indistinguishable from a non-existent one, or the
  // endpoint confirms a DRAFT posting exists to anyone guessing ids.
  it.each(['DRAFT', 'PENDING_MODERATION'] as const)('never-public job (%s) → 404', async (status) => {
    m.job.findUnique.mockResolvedValue({ id: JOB, status });
    await expect(service.create(input, REPORTER, IP)).rejects.toBeInstanceOf(NotFoundException);
    expect(m.contentReport.create).not.toHaveBeenCalled();
  });

  // A scam posting does not stop being worth reporting the moment it closes.
  it.each(['ACTIVE', 'EXPIRED', 'CLOSED'] as const)('publicly readable job (%s) → created', async (status) => {
    m.job.findUnique.mockResolvedValue({ id: JOB, status });
    await expect(service.create(input, REPORTER, IP)).resolves.toEqual({ id: 7 });
  });

  it('persists the reporter id, ip and a null details when none was given', async () => {
    await service.create(input, REPORTER, IP);
    expect(m.contentReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          targetType: 'JOB',
          jobId: JOB,
          reason: 'FAKE_OR_SCAM',
          details: null,
          reporterId: REPORTER,
          reporterIp: IP,
        },
      }),
    );
  });

  it('persists details when given', async () => {
    await service.create({ ...input, details: 'the salary is a lure' }, REPORTER, IP);
    expect(m.contentReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ details: 'the salary is a lure' }),
      }),
    );
  });

  describe('anonymous reporters', () => {
    it('files with a null reporterId', async () => {
      await expect(service.create(input, null, IP)).resolves.toEqual({ id: 7 });
      expect(m.contentReport.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ reporterId: null }) }),
      );
    });

    // The duplicate rule keys on reporterId, so running it for an anonymous
    // report would match an unrelated stranger's row and swallow a real report.
    it('skips the duplicate check entirely', async () => {
      await service.create(input, null, IP);
      expect(m.contentReport.findFirst).not.toHaveBeenCalled();
    });

    it('tolerates a missing ip', async () => {
      await expect(service.create(input, null, null)).resolves.toEqual({ id: 7 });
      expect(m.contentReport.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ reporterIp: null }) }),
      );
    });
  });

  describe('one open report per person per job', () => {
    it('409s when the same reporter already has a live report on this job', async () => {
      m.contentReport.findFirst.mockResolvedValue({ id: 5 });
      await expect(service.create(input, REPORTER, IP)).rejects.toBeInstanceOf(ConflictException);
      expect(m.contentReport.create).not.toHaveBeenCalled();
    });

    // Scoping matters as much as the rule: keyed on this job AND this reporter,
    // and only on the two non-terminal states.
    it('scopes the check to this job, this reporter, and live statuses only', async () => {
      await service.create(input, REPORTER, IP);
      expect(m.contentReport.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { jobId: JOB, reporterId: REPORTER, status: { in: ['OPEN', 'REVIEWING'] } },
        }),
      );
    });

    // A decided report is a closed record, not a permanent ban on complaining —
    // the content may have been edited since.
    it('allows a fresh report once the previous one has been decided', async () => {
      m.contentReport.findFirst.mockResolvedValue(null);
      await expect(service.create(input, REPORTER, IP)).resolves.toEqual({ id: 7 });
    });
  });
});
