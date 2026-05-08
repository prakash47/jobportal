import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/feature-flags', () => ({
  setFlag: vi.fn(),
  listFlags: vi.fn(),
  getFlag: vi.fn(),
  listAuditLog: vi.fn(),
}));

import {
  setFlag,
  listFlags as packageListFlags,
  getFlag as packageGetFlag,
  listAuditLog as packageListAuditLog,
} from '@jobportal/feature-flags';
import { CachePurgeService } from '../cache-purge/cache-purge.service';
import { FeatureFlagsService } from './feature-flags.service';

const mockedSetFlag = setFlag as ReturnType<typeof vi.fn>;
const mockedListFlags = packageListFlags as ReturnType<typeof vi.fn>;
const mockedGetFlag = packageGetFlag as ReturnType<typeof vi.fn>;
const mockedListAuditLog = packageListAuditLog as ReturnType<typeof vi.fn>;

describe('FeatureFlagsService', () => {
  let service: FeatureFlagsService;
  let cachePurge: { purgePaths: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.resetAllMocks();
    cachePurge = { purgePaths: vi.fn().mockResolvedValue(undefined) };
    service = new FeatureFlagsService(cachePurge as unknown as CachePurgeService);
  });

  describe('update', () => {
    it('returns updated flag and fires cache purge with mapped paths', async () => {
      const after = {
        id: 1,
        key: 'subscription.pricing_page.visible',
        enabled: true,
      };
      mockedSetFlag.mockResolvedValue(after);

      const out = await service.update(
        'subscription.pricing_page.visible',
        { enabled: true },
        { userId: 99 },
        'launch',
      );
      expect(out).toEqual(after);
      // Fire-and-log; let the .catch attach.
      await Promise.resolve();
      expect(cachePurge.purgePaths).toHaveBeenCalledWith(['/pricing']);
    });

    it('cache purge failure does not propagate to caller', async () => {
      mockedSetFlag.mockResolvedValue({ id: 1, key: 'k', enabled: true });
      cachePurge.purgePaths.mockRejectedValue(new Error('cloudflare 503'));
      // Should not throw — the toggle has already succeeded at the DB layer.
      await expect(service.update('k', { enabled: true }, { userId: 1 })).resolves.toMatchObject({
        id: 1,
      });
    });

    it('unknown flag → setFlag throws → cache purge does NOT fire', async () => {
      mockedSetFlag.mockRejectedValue(new Error('Unknown flag key: bogus'));
      await expect(service.update('bogus', { enabled: true }, { userId: 1 })).rejects.toThrow(
        /Unknown flag key/,
      );
      expect(cachePurge.purgePaths).not.toHaveBeenCalled();
    });
  });

  describe('list / get / auditLog', () => {
    it('list passes through to packageListFlags', async () => {
      mockedListFlags.mockResolvedValue([]);
      await service.list();
      expect(mockedListFlags).toHaveBeenCalledOnce();
    });

    it('get passes through to packageGetFlag', async () => {
      mockedGetFlag.mockResolvedValue(null);
      await service.get('foo');
      expect(mockedGetFlag).toHaveBeenCalledWith('foo');
    });

    it('auditLog forwards opts', async () => {
      mockedListAuditLog.mockResolvedValue({ hits: [], total: 0, page: 1, pageSize: 25 });
      await service.auditLog({ page: 2, flagKey: 'x' });
      expect(mockedListAuditLog).toHaveBeenCalledWith({ page: 2, flagKey: 'x' });
    });
  });
});
