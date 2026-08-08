import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  IntrinsicException,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Response } from 'express';
import * as Sentry from '@sentry/nestjs';
import { isTelemetryEnabled } from '@jobportal/observability';
import { retryAfterSeconds, withEnvelope } from '../common/http-error-envelope';

// Phase 1 item 18 — captures every unhandled exception that bubbles
// past per-route filters. Gated by killswitch.telemetry so an admin can
// instantly stop Sentry traffic without redeploying.
//
// We deliberately DON'T capture HttpException subclasses (Bad/Forbidden/
// NotFound/etc.) by default — those are expected control flow, not
// errors. Only 5xx-flavoured exceptions and bare Errors reach Sentry.
//
// It also shapes the response body (ADR 0002 decision 2). This filter is the
// single global filter, so it is the one place every error passes through.
// The envelope is Nest's own `{ statusCode, error, message }` — see
// common/http-error-envelope.ts for why codifying the existing shape rather
// than inventing one keeps all three web apps working untouched.
@Catch()
export class SentryGlobalFilter extends BaseExceptionFilter {
  // Named 'ExceptionsHandler' so the output is indistinguishable from the log
  // Nest's own BaseExceptionFilter used to emit. Writing the response here
  // means we no longer reach super.catch(), and its
  // `BaseExceptionFilter.logger.error(exception)` went with it — leaving a
  // bare 500 with no stack in the console, nothing in Sentry when SENTRY_DSN
  // is blank (the documented local-dev setup), and a response body
  // deliberately stripped of the message. This log is NOT gated on
  // isTelemetryEnabled(): killswitch.telemetry exists to stop Sentry traffic,
  // and it must not also blind the server's own logs.
  private readonly logger = new Logger('ExceptionsHandler');

  override async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    // HTTP 4xx is expected user-error path; skip Sentry capture but
    // still format the response.
    const isExpected4xx =
      exception instanceof HttpException && exception.getStatus() < 500;

    if (!isExpected4xx && (await isTelemetryEnabled())) {
      Sentry.captureException(exception);
    }

    // Non-HTTP contexts (there are none today, but BullMQ processors and any
    // future RPC transport would land here) have no response to write — hand
    // straight back to Nest.
    if (host.getType() !== 'http') {
      super.catch(exception, host);
      return;
    }

    const res = host.switchToHttp().getResponse<Response>();
    // If something upstream already started the response we cannot rewrite it;
    // let Nest's base filter deal with the (already-broken) situation.
    if (res.headersSent) {
      super.catch(exception, host);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      // Only FILL IN a Retry-After — never overwrite one. ThrottlerGuard sets
      // an accurate `timeToBlockExpire` immediately before it throws
      // (throttler.guard.js), and clobbering that with a guess would make the
      // very signal this branch advertises for mobile back-off less accurate
      // than what the API already emitted. retryAfterSeconds fills the gap
      // only for the budget quotas, which set no header of their own.
      if (res.getHeader('Retry-After') === undefined) {
        const retry = retryAfterSeconds(status, body);
        if (retry !== null) res.setHeader('Retry-After', String(retry));
      }
      res.status(status).json(withEnvelope(body, status));
      return;
    }

    // Bare Error / unknown throw. The RESPONSE deliberately does not leak the
    // message or stack, but the server must still record it — see the logger
    // comment above. IntrinsicException is Nest's own marker for exceptions it
    // raises as control flow and expects to stay quiet.
    if (!(exception instanceof IntrinsicException)) this.logger.error(exception);
    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    res.status(status).json(withEnvelope('Internal server error', status));
  }
}
