import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeatureFlagsController } from './feature-flags.controller';
import type { FeatureFlagsService } from './feature-flags.service';

describe('FeatureFlagsController.update — reason enforcement', () => {
  let controller: FeatureFlagsController;
  let service: { update: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    service = { update: vi.fn().mockResolvedValue({ id: 1, key: 'k', enabled: true }) };
    controller = new FeatureFlagsController(service as unknown as FeatureFlagsService);
  });

  it('rejects critical flag PATCH with no reason (400)', async () => {
    await expect(
      controller.update('killswitch.transactional_emails', { enabled: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.update).not.toHaveBeenCalled();
  });

  it('rejects critical flag PATCH with whitespace-only reason', async () => {
    await expect(
      controller.update('services.menu.visible', { enabled: false, reason: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts critical flag PATCH with a real reason', async () => {
    const out = await controller.update('killswitch.job_alerts', {
      enabled: true,
      reason: 'launching alerts',
    });
    expect(out).toMatchObject({ id: 1 });
    expect(service.update).toHaveBeenCalledWith(
      'killswitch.job_alerts',
      { enabled: true },
      { userId: 0 },
      'launching alerts',
    );
  });

  it('accepts non-critical flag PATCH without a reason', async () => {
    await controller.update('feature.bulk_apply', { enabled: true });
    expect(service.update).toHaveBeenCalledWith(
      'feature.bulk_apply',
      { enabled: true },
      { userId: 0 },
      undefined,
    );
  });

  it('400 on bad payload (Zod validation)', async () => {
    await expect(
      controller.update('feature.bulk_apply', { percentage: 150 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
