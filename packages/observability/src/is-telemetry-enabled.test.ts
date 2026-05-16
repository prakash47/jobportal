import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/feature-flags', () => ({
  isFlagEnabled: vi.fn(),
}));

import { isFlagEnabled } from '@jobportal/feature-flags';
import { isTelemetryEnabled } from './is-telemetry-enabled';

const mockedFlag = isFlagEnabled as unknown as ReturnType<typeof vi.fn>;

describe('isTelemetryEnabled', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('killswitch OFF → telemetry enabled', async () => {
    mockedFlag.mockResolvedValue(false);
    expect(await isTelemetryEnabled()).toBe(true);
    expect(mockedFlag).toHaveBeenCalledWith('killswitch.telemetry');
  });

  it('killswitch ON → telemetry disabled', async () => {
    mockedFlag.mockResolvedValue(true);
    expect(await isTelemetryEnabled()).toBe(false);
  });

  it('flag lookup throws → defaults to enabled (over-capture > blind)', async () => {
    mockedFlag.mockRejectedValue(new Error('Redis down'));
    expect(await isTelemetryEnabled()).toBe(true);
  });
});
