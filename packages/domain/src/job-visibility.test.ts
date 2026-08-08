import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: { jobCollaborator: { findUnique: vi.fn() } },
}));

import { prisma } from '@jobportal/db';
import type { AccessClaims } from '@jobportal/auth';
import { canViewJob, isPubliclyReadable } from './job-visibility';

const m = prisma as unknown as {
  jobCollaborator: { findUnique: ReturnType<typeof vi.fn> };
};

const OWNER: AccessClaims = {
  sub: 42,
  email: 'priya@nimbus.com',
  role: 'RECRUITER',
  emailVerified: true,
};
const OTHER: AccessClaims = { ...OWNER, sub: 99, email: 'rohan@veridian.com' };
const ADMIN: AccessClaims = { ...OWNER, sub: 7, email: 'admin@x.in', role: 'ADMIN' };
const SEEKER: AccessClaims = { ...OWNER, sub: 55, role: 'CANDIDATE' };

const job = (over: Partial<{ id: number; status: string; postedById: number | null }> = {}) =>
  ({ id: 100001, status: 'PENDING_MODERATION', postedById: 42, ...over }) as never;

describe('isPubliclyReadable', () => {
  // EXPIRED and CLOSED stay readable: they were public, may be linked from an
  // old email or an external site, and render an explanatory notice.
  it.each(['ACTIVE', 'EXPIRED', 'CLOSED'])('%s is public', (status) => {
    expect(isPubliclyReadable(status as never)).toBe(true);
  });

  // These have never been public. Serving them would defeat the review gate.
  it.each(['DRAFT', 'PENDING_MODERATION'])('%s is not public', (status) => {
    expect(isPubliclyReadable(status as never)).toBe(false);
  });
});

describe('canViewJob', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.jobCollaborator.findUnique.mockResolvedValue(null);
  });

  it('lets anyone — including anonymous — see a live job', async () => {
    await expect(canViewJob(null, job({ status: 'ACTIVE' }))).resolves.toBe(true);
  });

  // The headline guarantee: a job awaiting approval is invisible to the public.
  it('hides a job awaiting review from an anonymous visitor', async () => {
    await expect(canViewJob(null, job())).resolves.toBe(false);
  });

  it('hides a job awaiting review from a signed-in job seeker', async () => {
    await expect(canViewJob(SEEKER, job())).resolves.toBe(false);
  });

  it('hides a job awaiting review from a recruiter at another company', async () => {
    await expect(canViewJob(OTHER, job())).resolves.toBe(false);
  });

  // The recruiter ⋮ menu's "Preview / View public job page" links straight here
  // and must keep working for an unpublished job.
  it('lets the poster preview their own unpublished job', async () => {
    await expect(canViewJob(OWNER, job())).resolves.toBe(true);
    expect(m.jobCollaborator.findUnique).not.toHaveBeenCalled();
  });

  it('lets an admin open the job they are being asked to approve', async () => {
    await expect(canViewJob(ADMIN, job())).resolves.toBe(true);
    expect(m.jobCollaborator.findUnique).not.toHaveBeenCalled();
  });

  it('lets a collaborator preview it', async () => {
    m.jobCollaborator.findUnique.mockResolvedValue({ jobId: 100001 });
    await expect(canViewJob(OTHER, job())).resolves.toBe(true);
    expect(m.jobCollaborator.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { jobId_userId: { jobId: 100001, userId: 99 } } }),
    );
  });

  it('applies the same rule to DRAFT jobs, which leaked identically', async () => {
    await expect(canViewJob(null, job({ status: 'DRAFT' }))).resolves.toBe(false);
    await expect(canViewJob(OWNER, job({ status: 'DRAFT' }))).resolves.toBe(true);
  });

  // Job.postedById is nullable (SetNull when a recruiter departs). A null owner
  // must not match a null-ish viewer or grant access to everyone.
  it('does not treat an orphaned job as owned by anyone', async () => {
    await expect(canViewJob(OTHER, job({ postedById: null }))).resolves.toBe(false);
    await expect(canViewJob(null, job({ postedById: null }))).resolves.toBe(false);
  });

  // The collaborator lookup is the only query, and it must not run for anon.
  it('never queries the database for an anonymous viewer', async () => {
    await canViewJob(null, job());
    expect(m.jobCollaborator.findUnique).not.toHaveBeenCalled();
  });
});
