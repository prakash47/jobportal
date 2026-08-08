import { BadRequestException, HttpException, type ArgumentsHost, type HttpServer } from '@nestjs/common';
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

// The filter now writes the response itself (it no longer delegates formatting
// to BaseExceptionFilter), so the host has to be a real enough double: a
// getType() and an http context carrying a response. The previous
// `{} as ArgumentsHost` stopped working the moment the filter grew that
// responsibility.
function makeHost(headers: Record<string, string> = {}) {
  const res = {
    headersSent: false,
    statusCode: 0,
    body: undefined as unknown,
    headers: { ...headers } as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    getHeader(name: string) {
      return this.headers[name];
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  };
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

const fakeAdapter = {} as HttpServer;

describe('SentryGlobalFilter', () => {
  let filter: SentryGlobalFilter;

  beforeEach(() => {
    vi.resetAllMocks();
    mockedTelemetry.mockResolvedValue(true);
    filter = new SentryGlobalFilter(fakeAdapter);
    // The filter logs unhandled 500s; keep the suite output clean.
    vi.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
  });

  it('captures unknown errors (5xx-class) when telemetry is enabled', async () => {
    const { host } = makeHost();
    await filter.catch(new Error('boom'), host);
    expect(mockedCapture).toHaveBeenCalledOnce();
  });

  it('does NOT capture 4xx HttpExceptions (expected user-error path)', async () => {
    const { host } = makeHost();
    await filter.catch(new BadRequestException('nope'), host);
    expect(mockedCapture).not.toHaveBeenCalled();
  });

  it('killswitch.telemetry ON → does NOT capture even 5xx', async () => {
    mockedTelemetry.mockResolvedValue(false);
    const { host } = makeHost();
    await filter.catch(new Error('boom'), host);
    expect(mockedCapture).not.toHaveBeenCalled();
  });

  // --- response shaping (new responsibility) ---

  it('still LOGS an unhandled error when telemetry is off — the killswitch must not blind the logs', async () => {
    mockedTelemetry.mockResolvedValue(false);
    const { host } = makeHost();
    await filter.catch(new Error('boom'), host);
    expect(filter['logger'].error).toHaveBeenCalledOnce();
  });

  it('never leaks the message or stack of a bare Error into the response', async () => {
    const { host, res } = makeHost();
    await filter.catch(new Error('connection string: postgres://user:pw@host'), host);
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('postgres://');
    expect(res.body).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
    });
  });

  it('shapes an HttpException into the envelope', async () => {
    const { host, res } = makeHost();
    await filter.catch(new BadRequestException('bad input'), host);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'bad input',
    });
  });

  it('does NOT overwrite a Retry-After a guard already set', async () => {
    // ThrottlerGuard sets an accurate timeToBlockExpire before throwing;
    // replacing it with a guess is strictly worse than leaving it.
    const { host, res } = makeHost({ 'Retry-After': '3' });
    await filter.catch(new HttpException('Too Many Requests', 429), host);
    expect(res.headers['Retry-After']).toBe('3');
  });

  it('fills in Retry-After for a budget quota that set none', async () => {
    const { host, res } = makeHost();
    await filter.catch(
      new HttpException({ limit: 10, upgradeAvailable: false, message: 'Daily limit' }, 429),
      host,
    );
    expect(Number(res.headers['Retry-After'])).toBeGreaterThan(0);
  });

  it('emits NO Retry-After for a 429 whose window it cannot know', async () => {
    // A wrong value is worse than none — a client honouring 60s against an
    // hour-long lockout retries sixty times.
    const { host, res } = makeHost();
    await filter.catch(new HttpException('Too many login attempts', 429), host);
    expect(res.headers['Retry-After']).toBeUndefined();
  });

  it('delegates non-HTTP contexts to the base filter without touching a response', async () => {
    const host = { getType: () => 'rpc' } as unknown as ArgumentsHost;
    await expect(filter.catch(new Error('boom'), host)).resolves.toBeUndefined();
  });
});
