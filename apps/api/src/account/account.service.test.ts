import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    user: { findUnique: vi.fn(), delete: vi.fn() },
    resume: { findMany: vi.fn() },
  },
}));

import { prisma } from '@jobportal/db';
import { AccountService } from './account.service';

const mocked = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  resume: { findMany: ReturnType<typeof vi.fn> };
};

const fakeStorage = {
  deleteObject: vi.fn().mockResolvedValue(undefined),
} as { deleteObject: ReturnType<typeof vi.fn> };

describe('AccountService.deleteOwnAccount', () => {
  let service: AccountService;

  beforeEach(() => {
    vi.resetAllMocks();
    fakeStorage.deleteObject.mockResolvedValue(undefined);
    mocked.user.findUnique.mockResolvedValue({ id: 9, role: 'CANDIDATE', candidate: { id: 3 } });
    mocked.resume.findMany.mockResolvedValue([{ r2Key: 'a.pdf' }, { r2Key: 'b.pdf' }]);
    mocked.user.delete.mockResolvedValue({ id: 9 });
    service = new AccountService(fakeStorage as unknown as never);
  });

  it('deletes the user row', async () => {
    await expect(service.deleteOwnAccount(9)).resolves.toEqual({ deleted: true });
    expect(mocked.user.delete).toHaveBeenCalledWith({ where: { id: 9 } });
  });

  // The whole reason this is not a one-line prisma.user.delete(). A database
  // cascade cannot reach object storage, so without this the account reports
  // itself deleted while every CV it held survives in the bucket.
  it('removes every stored resume object, not just the active one', async () => {
    await service.deleteOwnAccount(9);
    expect(fakeStorage.deleteObject).toHaveBeenCalledWith('a.pdf');
    expect(fakeStorage.deleteObject).toHaveBeenCalledWith('b.pdf');
    expect(fakeStorage.deleteObject).toHaveBeenCalledTimes(2);
  });

  // Ordering is load-bearing: the keys live in the rows, so reading them after
  // the delete would return nothing and silently orphan every object.
  it('reads the storage keys BEFORE deleting the rows', async () => {
    const order: string[] = [];
    mocked.resume.findMany.mockImplementation(async () => {
      order.push('read-keys');
      return [{ r2Key: 'a.pdf' }];
    });
    mocked.user.delete.mockImplementation(async () => {
      order.push('delete-rows');
      return { id: 9 };
    });
    await service.deleteOwnAccount(9);
    expect(order).toEqual(['read-keys', 'delete-rows']);
  });

  // A bucket failure must not resurrect an account that is already gone, nor
  // fail a request whose primary effect has already succeeded.
  it('still succeeds when storage cleanup fails, and says so in the logs', async () => {
    fakeStorage.deleteObject.mockRejectedValue(new Error('R2 down'));
    await expect(service.deleteOwnAccount(9)).resolves.toEqual({ deleted: true });
    expect(mocked.user.delete).toHaveBeenCalled();
  });

  it('scopes the resume lookup to the calling account', async () => {
    await service.deleteOwnAccount(9);
    expect(mocked.resume.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { candidateId: 3 } }),
    );
  });

  // A user who registered and never opened their profile has no Candidate row.
  it('handles a candidate with no profile row at all', async () => {
    mocked.user.findUnique.mockResolvedValue({ id: 9, role: 'CANDIDATE', candidate: null });
    await expect(service.deleteOwnAccount(9)).resolves.toEqual({ deleted: true });
    expect(mocked.resume.findMany).not.toHaveBeenCalled();
    expect(fakeStorage.deleteObject).not.toHaveBeenCalled();
  });

  // Deliberate scope boundary, not an oversight: a recruiter may be the sole
  // OWNER of a company, and their jobs outlive them via SetNull. Turning an
  // employer into the console's "no account holder" state from a self-service
  // endpoint is worse than refusing.
  it.each(['RECRUITER', 'ADMIN'] as const)('refuses to delete a %s account', async (role) => {
    mocked.user.findUnique.mockResolvedValue({ id: 9, role, candidate: null });
    await expect(service.deleteOwnAccount(9)).rejects.toBeInstanceOf(ForbiddenException);
    expect(mocked.user.delete).not.toHaveBeenCalled();
  });

  it('404s an account that does not exist', async () => {
    mocked.user.findUnique.mockResolvedValue(null);
    await expect(service.deleteOwnAccount(9)).rejects.toBeInstanceOf(NotFoundException);
    expect(mocked.user.delete).not.toHaveBeenCalled();
  });
});
