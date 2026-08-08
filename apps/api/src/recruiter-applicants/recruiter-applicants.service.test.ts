import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    job: { findUnique: vi.fn(), findFirst: vi.fn() },
    application: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
    candidate: { findUnique: vi.fn() },
    resume: { findUnique: vi.fn() },
  },
}));

import { prisma } from '@jobportal/db';
import { RecruiterApplicantsService } from './recruiter-applicants.service';

const mocked = prisma as unknown as {
  job: { findUnique: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
  application: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  candidate: { findUnique: ReturnType<typeof vi.fn> };
  resume: { findUnique: ReturnType<typeof vi.fn> };
};

const fakeEmail = {
  enqueueApplicationStatusChange: vi.fn().mockResolvedValue(undefined),
} as { enqueueApplicationStatusChange: ReturnType<typeof vi.fn> };

const fakeStorage = {
  getSignedDownloadUrl: vi.fn().mockResolvedValue('https://signed.example/x'),
} as { getSignedDownloadUrl: ReturnType<typeof vi.fn> };

const ownedApp = {
  id: 99,
  userId: 7,
  status: 'APPLIED' as const,
  statusHistory: [],
  recruiterNotes: null,
  job: {
    id: 5,
    postedById: 42,
    title: 'SE',
    company: { name: 'Acme' },
    // Filtered `collaborators` sub-select (empty = viewer is not a collaborator).
    collaborators: [],
  },
  user: { email: 'cand@example.com' },
};

describe('RecruiterApplicantsService.list', () => {
  let service: RecruiterApplicantsService;

  beforeEach(() => {
    vi.resetAllMocks();
    fakeEmail.enqueueApplicationStatusChange.mockResolvedValue(undefined);
    service = new RecruiterApplicantsService(
      fakeEmail as unknown as never,
      fakeStorage as unknown as never,
    );
  });

  it('throws NotFoundException when access does not match (no leak)', async () => {
    // findFirst applies the owner-OR-collaborator filter — no match ⇒ null ⇒ 404.
    mocked.job.findFirst.mockResolvedValue(null);
    await expect(service.list(42, 5, {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns hits and total for an owner or collaborator', async () => {
    mocked.job.findFirst.mockResolvedValue({ id: 5, title: 'SE' });
    mocked.application.findMany.mockResolvedValue([]);
    mocked.application.count.mockResolvedValue(0);
    const out = await service.list(42, 5, {});
    expect(out.job.title).toBe('SE');
    expect(out.total).toBe(0);
  });

  it('honours sort=status', async () => {
    mocked.job.findFirst.mockResolvedValue({ id: 5, title: 'SE' });
    mocked.application.findMany.mockResolvedValue([]);
    mocked.application.count.mockResolvedValue(0);
    await service.list(42, 5, { sort: 'status' });
    const args = mocked.application.findMany.mock.calls[0]?.[0] as { orderBy: unknown };
    expect(args.orderBy).toEqual([{ status: 'asc' }, { appliedAt: 'desc' }]);
  });
});

describe('RecruiterApplicantsService.transition', () => {
  let service: RecruiterApplicantsService;

  beforeEach(() => {
    vi.resetAllMocks();
    fakeEmail.enqueueApplicationStatusChange.mockResolvedValue(undefined);
    service = new RecruiterApplicantsService(
      fakeEmail as unknown as never,
      fakeStorage as unknown as never,
    );
  });

  it('cross-job 404 (no leak) when the recruiter neither owns nor collaborates', async () => {
    mocked.application.findUnique.mockResolvedValue({
      ...ownedApp,
      job: { ...ownedApp.job, postedById: 999, collaborators: [] },
    });
    await expect(service.transition(42, 99, 'IN_REVIEW')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows a collaborator (not the owner) to transition', async () => {
    // postedById is someone else, but the viewer (42) has a collaborator row.
    mocked.application.findUnique.mockResolvedValue({
      ...ownedApp,
      job: { ...ownedApp.job, postedById: 999, collaborators: [{ userId: 42 }] },
    });
    mocked.application.update.mockResolvedValue({ id: 99, status: 'IN_REVIEW', updatedAt: new Date() });
    await expect(service.transition(42, 99, 'IN_REVIEW')).resolves.toMatchObject({
      status: 'IN_REVIEW',
    });
  });

  it('rejects an invalid forward transition (state machine guard)', async () => {
    mocked.application.findUnique.mockResolvedValue(ownedApp);
    // APPLIED → INTERVIEWED skips IN_REVIEW + SHORTLISTED — rejected.
    await expect(service.transition(42, 99, 'INTERVIEWED')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(mocked.application.update).not.toHaveBeenCalled();
  });

  it('happy path APPLIED → IN_REVIEW: appends history + fires email', async () => {
    mocked.application.findUnique.mockResolvedValue(ownedApp);
    mocked.application.update.mockResolvedValue({
      id: 99,
      status: 'IN_REVIEW',
      updatedAt: new Date(),
    });
    const out = await service.transition(42, 99, 'IN_REVIEW');
    expect(out.status).toBe('IN_REVIEW');

    const updateArgs = mocked.application.update.mock.calls[0]?.[0] as {
      data: { statusHistory: Array<Record<string, unknown>> };
    };
    expect(updateArgs.data.statusHistory).toHaveLength(1);
    expect(updateArgs.data.statusHistory[0]).toMatchObject({
      from: 'APPLIED',
      to: 'IN_REVIEW',
      by: 'RECRUITER',
    });

    // Email is fire-and-log; let the .catch attach.
    await Promise.resolve();
    expect(fakeEmail.enqueueApplicationStatusChange).toHaveBeenCalledWith(
      'cand@example.com',
      7,
      expect.objectContaining({ from: 'APPLIED', to: 'IN_REVIEW' }),
    );
  });

  it('REJECTED is allowed from any non-terminal state', async () => {
    mocked.application.findUnique.mockResolvedValue({ ...ownedApp, status: 'INTERVIEWED' });
    mocked.application.update.mockResolvedValue({
      id: 99,
      status: 'REJECTED',
      updatedAt: new Date(),
    });
    await expect(service.transition(42, 99, 'REJECTED')).resolves.toMatchObject({
      status: 'REJECTED',
    });
  });

  it('cannot transition out of a terminal state', async () => {
    mocked.application.findUnique.mockResolvedValue({ ...ownedApp, status: 'HIRED' });
    await expect(service.transition(42, 99, 'OFFERED')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('RecruiterApplicantsService.setNotes', () => {
  let service: RecruiterApplicantsService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new RecruiterApplicantsService(
      fakeEmail as unknown as never,
      fakeStorage as unknown as never,
    );
  });

  it('round-trips the notes', async () => {
    mocked.application.findUnique.mockResolvedValue(ownedApp);
    mocked.application.update.mockResolvedValue({ recruiterNotes: 'Strong portfolio' });
    const out = await service.setNotes(42, 99, 'Strong portfolio');
    expect(out.recruiterNotes).toBe('Strong portfolio');
  });

  it('clearing notes (empty string) writes null', async () => {
    mocked.application.findUnique.mockResolvedValue(ownedApp);
    mocked.application.update.mockResolvedValue({ recruiterNotes: null });
    await service.setNotes(42, 99, '');
    const updateArgs = mocked.application.update.mock.calls[0]?.[0] as {
      data: { recruiterNotes: string | null };
    };
    expect(updateArgs.data.recruiterNotes).toBeNull();
  });

  it('cross-job 404', async () => {
    mocked.application.findUnique.mockResolvedValue({
      ...ownedApp,
      job: { ...ownedApp.job, postedById: 999 },
    });
    await expect(service.setNotes(42, 99, 'x')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('RecruiterApplicantsService.getResumeUrl', () => {
  let service: RecruiterApplicantsService;

  beforeEach(() => {
    vi.resetAllMocks();
    fakeStorage.getSignedDownloadUrl.mockResolvedValue('https://signed.example/x');
    service = new RecruiterApplicantsService(
      fakeEmail as unknown as never,
      fakeStorage as unknown as never,
    );
  });

  it('cross-job 404 leaks nothing', async () => {
    mocked.application.findUnique.mockResolvedValueOnce({
      ...ownedApp,
      job: { ...ownedApp.job, postedById: 999 },
    });
    await expect(service.getResumeUrl(42, 99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('candidate has no resume → 404', async () => {
    mocked.application.findUnique.mockResolvedValueOnce(ownedApp);
    mocked.application.findUnique.mockResolvedValueOnce({ userId: 7 });
    mocked.candidate.findUnique.mockResolvedValue({ activeResume: null });
    await expect(service.getResumeUrl(42, 99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('candidate resume still PENDING scan → 403', async () => {
    mocked.application.findUnique.mockResolvedValueOnce(ownedApp);
    mocked.application.findUnique.mockResolvedValueOnce({ userId: 7 });
    mocked.candidate.findUnique.mockResolvedValue({
      activeResume: { r2Key: 'k', deletedAt: null, scanStatus: 'PENDING', originalFilename: 'cv.pdf' },
    });
    await expect(service.getResumeUrl(42, 99)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('happy path returns signed URL + filename', async () => {
    mocked.application.findUnique.mockResolvedValueOnce(ownedApp);
    mocked.application.findUnique.mockResolvedValueOnce({ userId: 7 });
    mocked.candidate.findUnique.mockResolvedValue({
      activeResume: { r2Key: 'k', deletedAt: null, scanStatus: 'CLEAN', originalFilename: 'cv.pdf' },
    });
    const out = await service.getResumeUrl(42, 99);
    expect(out.url).toBe('https://signed.example/x');
    expect(out.filename).toBe('cv.pdf');
    expect(out.expiresInSeconds).toBe(900);
    expect(fakeStorage.getSignedDownloadUrl).toHaveBeenCalledWith('k', 900);
  });
});

// ADR 0002 decision 7 — serve the resume that was SUBMITTED, not whatever the
// candidate happens to have on their profile today.
describe('RecruiterApplicantsService.getResumeUrl — snapshot vs legacy', () => {
  let service: RecruiterApplicantsService;

  beforeEach(() => {
    vi.resetAllMocks();
    fakeStorage.getSignedDownloadUrl.mockResolvedValue('https://signed.example/x');
    service = new RecruiterApplicantsService(
      fakeEmail as unknown as never,
      fakeStorage as unknown as never,
    );
  });

  // The whole point. If this ever falls through to the candidate's CURRENT CV,
  // a candidate replacing their file silently rewrites what the recruiter is
  // reading for an application already under review.
  it('serves the snapshot and never consults the candidate profile', async () => {
    mocked.application.findUnique.mockResolvedValueOnce({ ...ownedApp, resumeId: 555 });
    mocked.resume.findUnique.mockResolvedValue({
      r2Key: 'submitted-key',
      originalFilename: 'submitted.pdf',
      scanStatus: 'CLEAN',
      deletedAt: null,
    });
    // Deliberately arm the fallback with a DIFFERENT document, so a regression
    // that reaches for it produces the wrong file rather than the same one.
    mocked.candidate.findUnique.mockResolvedValue({
      activeResume: {
        r2Key: 'current-key',
        originalFilename: 'current.pdf',
        scanStatus: 'CLEAN',
        deletedAt: null,
      },
    });

    const out = await service.getResumeUrl(42, 99);
    expect(out.filename).toBe('submitted.pdf');
    expect(fakeStorage.getSignedDownloadUrl).toHaveBeenCalledWith('submitted-key', 900);
    expect(mocked.candidate.findUnique).not.toHaveBeenCalled();
  });

  // A soft-deleted snapshot is still served: the recruiter already received
  // that document, and withdrawing it mid-review would be a worse outcome than
  // showing a file the candidate has since replaced.
  it('still serves a snapshot whose resume was later soft-deleted', async () => {
    mocked.application.findUnique.mockResolvedValueOnce({ ...ownedApp, resumeId: 555 });
    // deletedAt is SET — the state the test is named for. Earlier this fixture
    // omitted the field entirely, which made the test indistinguishable from
    // the not-deleted case and therefore incapable of failing.
    mocked.resume.findUnique.mockResolvedValue({
      r2Key: 'submitted-key',
      originalFilename: 'submitted.pdf',
      scanStatus: 'CLEAN',
      deletedAt: new Date('2026-08-01T00:00:00Z'),
    });
    const out = await service.getResumeUrl(42, 99);
    expect(out.filename).toBe('submitted.pdf');
    expect(fakeStorage.getSignedDownloadUrl).toHaveBeenCalledWith('submitted-key', 900);
  });

  // The two branches must treat the identical state differently, which is the
  // only thing that makes the snapshot branch's deletedAt behaviour meaningful.
  it('404s that SAME soft-deleted state when it arrives via the legacy path', async () => {
    mocked.application.findUnique.mockResolvedValueOnce({ ...ownedApp, resumeId: null });
    mocked.candidate.findUnique.mockResolvedValue({
      activeResume: {
        r2Key: 'submitted-key',
        originalFilename: 'submitted.pdf',
        scanStatus: 'CLEAN',
        deletedAt: new Date('2026-08-01T00:00:00Z'),
      },
    });
    await expect(service.getResumeUrl(42, 99)).rejects.toBeInstanceOf(NotFoundException);
  });

  // The lookup must use the application's OWN resumeId. Asserting only that
  // some id came back would stay green if the service fetched a constant.
  it('fetches the snapshot by the id recorded on THIS application', async () => {
    mocked.application.findUnique.mockResolvedValueOnce({ ...ownedApp, resumeId: 777 });
    mocked.resume.findUnique.mockResolvedValue({
      r2Key: 'k',
      originalFilename: 'f.pdf',
      scanStatus: 'CLEAN',
      deletedAt: null,
    });
    await service.getResumeUrl(42, 99);
    expect(mocked.resume.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 777 } }),
    );
  });

  // Rows that predate the column. Which CV was sent is genuinely unknown, so
  // they keep the old behaviour rather than 404-ing an application a recruiter
  // could open yesterday.
  it('falls back to the current CV for a legacy application', async () => {
    mocked.application.findUnique.mockResolvedValueOnce({ ...ownedApp, resumeId: null });
    mocked.candidate.findUnique.mockResolvedValue({
      activeResume: {
        r2Key: 'current-key',
        originalFilename: 'current.pdf',
        scanStatus: 'CLEAN',
        deletedAt: null,
      },
    });
    const out = await service.getResumeUrl(42, 99);
    expect(out.filename).toBe('current.pdf');
    expect(mocked.resume.findUnique).not.toHaveBeenCalled();
  });

  it('404s a legacy application whose current CV is soft-deleted', async () => {
    mocked.application.findUnique.mockResolvedValueOnce({ ...ownedApp, resumeId: null });
    mocked.candidate.findUnique.mockResolvedValue({
      activeResume: {
        r2Key: 'k',
        originalFilename: 'cv.pdf',
        scanStatus: 'CLEAN',
        deletedAt: new Date(),
      },
    });
    await expect(service.getResumeUrl(42, 99)).rejects.toBeInstanceOf(NotFoundException);
  });

  // A snapshot row that has vanished entirely (hard delete → SetNull is the
  // normal path, but a stale id must not 500).
  it('falls back rather than throwing when the snapshot row is gone', async () => {
    mocked.application.findUnique.mockResolvedValueOnce({ ...ownedApp, resumeId: 555 });
    mocked.resume.findUnique.mockResolvedValue(null);
    mocked.candidate.findUnique.mockResolvedValue({
      activeResume: {
        r2Key: 'current-key',
        originalFilename: 'current.pdf',
        scanStatus: 'CLEAN',
        deletedAt: null,
      },
    });
    const out = await service.getResumeUrl(42, 99);
    expect(out.filename).toBe('current.pdf');
  });
});
