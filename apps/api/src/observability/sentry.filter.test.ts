import { BadRequestException, type ArgumentsHost, type HttpServer } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nestjs', () => ({
  captureException: vi.fn(),
}));
vi.mock('@jobportal/observability', () => ({
  isTelemetryEnabled: vi.fn(),
}));
// Stub BaseExceptionFilter.catch so we don't need a real HTTP adapter
// to test our wrapping behavior.
vi.mock('@nestjs/core', () => ({
  BaseExceptionFilter: class {
    constructor(_httpAdapter?: HttpServer) {}
    catch(_exception: unknown, _host: ArgumentsHost): void {
      // no-op
    }
  },
}));

import * as Sentry from '@sentry/nestjs';
import { isTelemetryEnabled } from '@jobportal/observability';
import { SentryGlobalFilter } from './sentry.filter';

const mockedCapture = Sentry.captureException as unknown as ReturnType<typeof vi.fn>;
const mockedTelemetry = isTelemetryEnabled as unknown as ReturnType<typeof vi.fn>;

const fakeHost = {} as ArgumentsHost;
const fakeAdapter = {} as HttpServer;

describe('SentryGlobalFilter', () => {
  let filter: SentryGlobalFilter;

  beforeEach(() => {
    vi.resetAllMocks();
    mockedTelemetry.mockResolvedValue(true);
    filter = new SentryGlobalFilter(fakeAdapter);
  });

  it('captures unknown errors (5xx-class) when telemetry is enabled', async () => {
    await filter.catch(new Error('boom'), fakeHost);
    expect(mockedCapture).toHaveBeenCalledOnce();
  });

  it('does NOT capture 4xx HttpExceptions (expected user-error path)', async () => {
    await filter.catch(new BadRequestException('nope'), fakeHost);
    expect(mockedCapture).not.toHaveBeenCalled();
  });

  it('killswitch.telemetry ON → does NOT capture even 5xx', async () => {
    mockedTelemetry.mockResolvedValue(false);
    await filter.catch(new Error('boom'), fakeHost);
    expect(mockedCapture).not.toHaveBeenCalled();
  });
});
